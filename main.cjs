const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createCloseController } = require('./close-controller.cjs');
const { createProjectStore } = require('./project-store.cjs');

let win;
const dataDir = () => path.join(app.getPath('userData'), 'projects');
const currentFile = () => path.join(dataDir(), 'current.json');
const recoveryDir = () => path.join(dataDir(), 'recovery');
const savedPathFile = () => path.join(app.getPath('userData'), 'saved-project-path.json');
let savedProjectPath = (() => { try { return JSON.parse(fs.readFileSync(savedPathFile(), 'utf8')).path || null; } catch { return null; } })();

function validProject(data) {
  return data && data.format === 'netzplaner' && Array.isArray(data.nodes) && Array.isArray(data.edges);
}
function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', flag: 'w' });
  fs.renameSync(tmp, file);
}
function persistProject(data) {
  if (!validProject(data)) throw new Error('Invalid project payload');
  const target = currentFile();
  const encoded = JSON.stringify(data, null, 2);
  fs.mkdirSync(recoveryDir(), { recursive: true });
  if (fs.existsSync(target)) {
    try {
      const prior = fs.readFileSync(target, 'utf8');
      if (prior !== encoded) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        atomicWrite(path.join(recoveryDir(), `recovery-${stamp}.json`), prior);
      }
    } catch (error) { console.error('Could not create recovery snapshot:', error); }
  }
  atomicWrite(target, encoded);
  return { saved: true, savedAt: new Date().toISOString() };
}

function loadProject() {
  if (savedProjectPath) {
    try {
      const data = JSON.parse(fs.readFileSync(savedProjectPath, 'utf8'));
      if (validProject(data)) return data;
    } catch {}
  }
  try {
    const data = JSON.parse(fs.readFileSync(currentFile(), 'utf8'));
    return validProject(data) ? data : null;
  } catch { return null; }
}

function readLatestRecovery() {
  let files=[];
  try { files=fs.readdirSync(recoveryDir()).filter(name=>name.endsWith('.json')).sort().reverse(); } catch { return null; }
  for (const name of files) {
    try { const data=JSON.parse(fs.readFileSync(path.join(recoveryDir(), name), 'utf8')); if(validProject(data)) return data; } catch {}
  }
  return null;
}

const projectStore = createProjectStore({ persistProject, loadProject, readLatestRecovery });
ipcMain.handle('project:load', () => projectStore.loadProject());
ipcMain.handle('project:save', (_event, data) => projectStore.save(data));
ipcMain.handle('project:restore-latest', () => projectStore.restoreLatest());
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('project:save-file', async (_event, data) => {
  await projectStore.save(data);
  let target = savedProjectPath;
  if (!target) {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Project',
      defaultPath: path.join(app.getPath('documents'), `${String(data.name || 'netzplan-project').replace(/[\\/:*?"<>|]+/g, '_')}.json`),
      filters: [{ name: 'Netzplaner Project', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    target = result.filePath;
  }
  atomicWrite(target, JSON.stringify(data, null, 2));
  atomicWrite(savedPathFile(), JSON.stringify({ path: target }, null, 2));
  savedProjectPath = target;
  return { saved: true, path: target };
});

ipcMain.handle('export:file', async (_event, options) => {
  try {
    const fileName = String(options && options.fileName ? options.fileName : 'export').replace(/[\\/:*?"<>|]+/g, '_');
    let extension = String(options && options.extension ? options.extension : 'png').toLowerCase();
    if (extension === 'jpeg') extension = 'jpg';
    const filters = [];
    if (extension === 'png') filters.push({ name: 'PNG Image', extensions: ['png'] });
    else if (extension === 'jpg') filters.push({ name: 'JPEG Image', extensions: ['jpg'] });
    else if (extension === 'pdf') filters.push({ name: 'PDF Document', extensions: ['pdf'] });
    else filters.push({ name: 'File', extensions: [extension] });

    const result = await dialog.showSaveDialog(win, {
      title: 'Export',
      defaultPath: path.join(app.getPath('documents'), `${fileName}.${extension}`),
      filters: filters
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const data = options && options.data;
    if (data) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      fs.mkdirSync(path.dirname(result.filePath), { recursive: true });
      fs.writeFileSync(result.filePath, buffer);
    }
    return { saved: true, path: result.filePath };
  } catch (error) {
    return { error: String(error && error.message ? error.message : error) };
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 900, minHeight: 650,
    title: 'Netzplaner', backgroundColor: '#0b0e14',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  const handleClose = createCloseController({
    confirmExit: async () => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Continue', 'Save & Exit'], defaultId: 0, cancelId: 0,
        title: 'Quit Netzplaner?', message: 'Your project will be saved locally before exiting.',
        detail: 'Automatic backups remain available for recovery.'
      });
      return response === 1;
    },
    flushSave: async () => {
      await win.webContents.executeJavaScript('window.flushProjectSave()');
      await projectStore.flush();
    },
    showSaveError: error => dialog.showMessageBox(win, {
      type: 'error', buttons: ['Continue'], defaultId: 0,
      title: 'Save failed',
      message: 'Netzplaner remains open because the project could not be saved.',
      detail: String(error?.message || error)
    }),
    closeWindow: () => win.close()
  });
  win.on('close', event => { void handleClose(event); });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.netzplaner.desktop');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
