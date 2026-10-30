const { contextBridge, ipcRenderer, shell } = require('electron');

const exposedApi = {
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
    return shell.openExternal(url);
  }
};

contextBridge.exposeInMainWorld('netzplaner', exposedApi);
