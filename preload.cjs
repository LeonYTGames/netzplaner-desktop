const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('netzplaner', {
  loadProject: function loadProjectFromMainProcess() {
    return ipcRenderer.invoke('project:load');
  },
  saveProject: function saveProjectToMainProcess(data) {
    return ipcRenderer.invoke('project:save', data);
  },
  saveProjectFile: function saveProjectToFile(data) {
    return ipcRenderer.invoke('project:save-file', data);
  },
  restoreLatest: function restoreLatestProjectFromMainProcess() {
    return ipcRenderer.invoke('project:restore-latest');
  },
  getVersion: function getApplicationVersion() {
    return ipcRenderer.invoke('app:get-version');
  },
  openExternal: function openUrlExternally(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Promise.resolve(false);
    }
    if (parsedUrl.protocol !== 'https:') {
      return Promise.resolve(false);
    }
    return shell.openExternal(parsedUrl.toString());
  },
  exportFile: function exportFileToDisk(options) {
    return ipcRenderer.invoke('export:file', options);
  }
});
