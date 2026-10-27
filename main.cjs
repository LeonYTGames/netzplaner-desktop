const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let win;
let allowClose = false;
let closePromptOpen = false;
let saveQueue = Promise.resolve();
const dataDir = () => path.join(app.getPath('userData'), 'projects');
const currentFile = () => path.join(dataDir(), 'current.json');
const recoveryDir = () => path.join(dataDir(), 'recovery');

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

ipcMain.handle('project:load', () => {
  try {
    const data = JSON.parse(fs.readFileSync(currentFile(), 'utf8'));
    return validProject(data) ? data : null;
  } catch { return null; }
});
ipcMain.handle('project:save', (_event, data) => {
  saveQueue = saveQueue.catch(() => {}).then(() => persistProject(data));
  return saveQueue;
});
ipcMain.handle('project:restore-latest', async () => {
  await saveQueue;
  let files=[];
  try { files=fs.readdirSync(recoveryDir()).filter(name=>name.endsWith('.json')).sort().reverse(); } catch { return null; }
  for (const name of files) {
    try { const data=JSON.parse(fs.readFileSync(path.join(recoveryDir(), name), 'utf8')); if(validProject(data)) return data; } catch {}
  }
  return null;
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
  win.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    dialog.showMessageBox(win, {
      type: 'question', buttons: ['Weiterarbeiten', 'Speichern & beenden'], defaultId: 0, cancelId: 0,
      title: 'Netzplaner beenden?', message: 'Dein Projekt wird lokal gespeichert, bevor Netzplaner beendet wird.',
      detail: 'Automatische Sicherungen bleiben für die Wiederherstellung erhalten.'
    }).then(async ({ response }) => {
      closePromptOpen = false;
      if (response !== 1) return;
      try {
        await win.webContents.executeJavaScript('window.flushProjectSave()');
        await saveQueue;
      } catch (error) { console.error('Final save failed:', error); }
      allowClose = true;
      win.close();
    });
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.netzplaner.desktop');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
