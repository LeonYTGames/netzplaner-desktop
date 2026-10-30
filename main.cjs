const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createCloseController } = require('./close-controller.cjs');
const { createProjectStore } = require('./project-store.cjs');

let mainWindow = null;

function getUserDataDirectory() {
  return app.getPath('userData');
}

function getProjectsDirectory() {
  return path.join(getUserDataDirectory(), 'projects');
}

function getCurrentProjectFilePath() {
  return path.join(getProjectsDirectory(), 'current.json');
}

function getRecoveryDirectory() {
  return path.join(getProjectsDirectory(), 'recovery');
}

function getSavedProjectPathFile() {
  return path.join(getUserDataDirectory(), 'saved-project-path.json');
}

function readSavedProjectPath() {
  try {
    const content = fs.readFileSync(getSavedProjectPathFile(), 'utf8');
    const parsed = JSON.parse(content);
    return parsed.path || null;
  } catch {
    return null;
  }
}

let savedProjectPath = readSavedProjectPath();

function isValidProjectData(data) {
  if (!data) {
    return false;
  }
  if (data.format !== 'netzplaner') {
    return false;
  }
  if (!Array.isArray(data.nodes)) {
    return false;
  }
  if (!Array.isArray(data.edges)) {
    return false;
  }
  return true;
}

function writeFileAtomically(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryFilePath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFilePath, contents, { encoding: 'utf8', flag: 'w' });
  fs.renameSync(temporaryFilePath, filePath);
}

function persistProjectData(data) {
  if (!isValidProjectData(data)) {
    throw new Error('Invalid project payload');
  }

  const targetFilePath = getCurrentProjectFilePath();
  const encodedProjectData = JSON.stringify(data, null, 2);

  fs.mkdirSync(getRecoveryDirectory(), { recursive: true });

  if (fs.existsSync(targetFilePath)) {
    try {
      const previousContent = fs.readFileSync(targetFilePath, 'utf8');
      if (previousContent !== encodedProjectData) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const recoveryFilePath = path.join(getRecoveryDirectory(), `recovery-${timestamp}.json`);
        writeFileAtomically(recoveryFilePath, previousContent);
      }
    } catch (error) {
      console.error('Could not create recovery snapshot:', error);
    }
  }

  writeFileAtomically(targetFilePath, encodedProjectData);
  return { saved: true, savedAt: new Date().toISOString() };
}

function loadProjectData() {
  if (savedProjectPath) {
    try {
      const content = fs.readFileSync(savedProjectPath, 'utf8');
      const data = JSON.parse(content);
      if (isValidProjectData(data)) {
        return data;
      }
    } catch {
      // Fall through to default project location
    }
  }

  try {
    const content = fs.readFileSync(getCurrentProjectFilePath(), 'utf8');
    const data = JSON.parse(content);
    if (isValidProjectData(data)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function readLatestRecoveryProject() {
  let recoveryFiles = [];
  try {
    recoveryFiles = fs
      .readdirSync(getRecoveryDirectory())
      .filter(function isJsonFile(fileName) {
        return fileName.endsWith('.json');
      })
      .sort()
      .reverse();
  } catch {
    return null;
  }

  for (let index = 0; index < recoveryFiles.length; index += 1) {
    const fileName = recoveryFiles[index];
    try {
      const filePath = path.join(getRecoveryDirectory(), fileName);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (isValidProjectData(data)) {
        return data;
      }
    } catch {
      // Skip invalid recovery files
    }
  }
  return null;
}

const projectStore = createProjectStore({
  persistProject: persistProjectData,
  loadProject: loadProjectData,
  readLatestRecovery: readLatestRecoveryProject
});

ipcMain.handle('project:load', function handleLoadProject() {
  return projectStore.loadProject();
});

ipcMain.handle('project:save', function handleSaveProject(event, data) {
  return projectStore.save(data);
});

ipcMain.handle('project:restore-latest', function handleRestoreLatestProject() {
  return projectStore.restoreLatest();
});

ipcMain.handle('app:get-version', function handleGetApplicationVersion() {
  return app.getVersion();
});

ipcMain.handle('project:save-file', async function handleSaveProjectToFile(event, data) {
  await projectStore.save(data);

  let targetFilePath = savedProjectPath;
  if (!targetFilePath) {
    const fileName = String(data.name || 'netzplan-project').replace(/[\\/:*?"<>|]+/g, '_');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project',
      defaultPath: path.join(app.getPath('documents'), `${fileName}.json`),
      filters: [{ name: 'Netzplaner Project', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    targetFilePath = result.filePath;
  }

  const encodedProjectData = JSON.stringify(data, null, 2);
  writeFileAtomically(targetFilePath, encodedProjectData);
  writeFileAtomically(getSavedProjectPathFile(), JSON.stringify({ path: targetFilePath }, null, 2));
  savedProjectPath = targetFilePath;

  return { saved: true, path: targetFilePath };
});

function createApplicationWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    title: 'Netzplaner',
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(function handleWindowOpen({ url }) {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const closeController = createCloseController({
    confirmExit: async function confirmExitApplication() {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Continue', 'Save & Exit'],
        defaultId: 0,
        cancelId: 0,
        title: 'Quit Netzplaner?',
        message: 'Your project will be saved locally before exiting.',
        detail: 'Automatic backups remain available for recovery.'
      });
      return response === 1;
    },
    flushSave: async function flushAllPendingSaves() {
      await mainWindow.webContents.executeJavaScript('window.flushProjectSave()');
      await projectStore.flush();
    },
    showSaveError: function showSaveErrorDialog(error) {
      return dialog.showMessageBox(mainWindow, {
        type: 'error',
        buttons: ['Continue'],
        defaultId: 0,
        title: 'Save failed',
        message: 'Netzplaner remains open because the project could not be saved.',
        detail: String(error && error.message ? error.message : error)
      });
    },
    closeWindow: function closeMainWindow() {
      mainWindow.close();
    }
  });

  mainWindow.on('close', function handleWindowClose(event) {
    void closeController(event);
  });

  mainWindow.on('closed', function handleWindowClosed() {
    mainWindow = null;
  });
}

app.whenReady().then(function onApplicationReady() {
  app.setAppUserModelId('com.netzplaner.desktop');
  createApplicationWindow();

  app.on('activate', function onApplicationActivate() {
    if (BrowserWindow.getAllWindows().length === 0) {
      createApplicationWindow();
    }
  });
});

app.on('window-all-closed', function onAllWindowsClosed() {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
