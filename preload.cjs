const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('netzplaner', {
  loadProject: () => ipcRenderer.invoke('project:load'),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  restoreLatest: () => ipcRenderer.invoke('project:restore-latest')
});
