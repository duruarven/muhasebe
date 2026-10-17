const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("accounting", {
  read: () => ipcRenderer.invoke("data:read"),
  add: (kind, input) => ipcRenderer.invoke("data:add", kind, input),
  update: (kind, id, input) =>
    ipcRenderer.invoke("data:update", kind, id, input),
  exportLedger: (contactId, filters) =>
    ipcRenderer.invoke("data:export-ledger", contactId, filters),
  pickAttachments: () => ipcRenderer.invoke("data:pick-attachments"),
  openAttachment: (invoiceId, attachmentId) =>
    ipcRenderer.invoke("data:open-attachment", invoiceId, attachmentId),
  print: () => ipcRenderer.invoke("data:print"),
  remove: (kind, id) => ipcRenderer.invoke("data:remove", kind, id),
  backup: () => ipcRenderer.invoke("data:backup"),
});
