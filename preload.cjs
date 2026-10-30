const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');
contextBridge.exposeInMainWorld('netzplaner', {
  loadProject: () => ipcRenderer.invoke('project:load'),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  saveProjectFile: (data) => ipcRenderer.invoke('project:save-file', data),
  restoreLatest: () => ipcRenderer.invoke('project:restore-latest'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url) => shell.openExternal(url),
});
