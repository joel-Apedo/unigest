const { contextBridge, ipcRenderer } = require('electron');

// Canal générique : invoke('db', action, payload)
contextBridge.exposeInMainWorld('api', {
  invoke: (action, payload) => ipcRenderer.invoke('db', action, payload)
});
