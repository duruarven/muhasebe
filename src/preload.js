const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('accounting', {
  read: () => ipcRenderer.invoke('data:read'),
  add: (kind, input) => ipcRenderer.invoke('data:add', kind, input),
  remove: (kind, id) => ipcRenderer.invoke('data:remove', kind, id),
  backup: () => ipcRenderer.invoke('data:backup')
});
