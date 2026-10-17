const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
let store;
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
function window() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1100, minHeight: 720, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const trustedPage = pathToFileURL(path.join(__dirname, 'index.html')).href;
  win.webContents.on('will-navigate', (event, url) => { if (url !== trustedPage) event.preventDefault(); });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
  if (!primary) return;
  try { store = new Store(path.join(app.getPath('userData'), 'muhasebe.json')); }
  catch (e) { dialog.showErrorBox('Veriler açılamadı', e.message); app.quit(); return; }
  const handle = (name, fn) => ipcMain.handle(name, async (_event, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  handle('data:read', () => store.data);
  handle('data:add', (kind, input) => store.add(kind, input));
  handle('data:update', (kind, id, input) => store.update(kind, id, input));
  handle('data:remove', (kind, id) => store.remove(kind, id));
  ipcMain.handle('data:print', (event) => new Promise(resolve => {
    event.sender.print({ silent: false, printBackground: true }, (ok, reason) => resolve(ok ? { ok: true } : { ok: false, error: reason || 'Yazdırma iptal edildi.' }));
  }));
  handle('data:backup', async () => {
    const result = await dialog.showSaveDialog({ title: 'Yedeği kaydet', defaultPath: `muhasebe-yedek-${new Date().toISOString().slice(0,10)}.json`, filters: [{name:'JSON yedek', extensions:['json']}] });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(store.data, null, 2));
    return 'Yedek kaydedildi.';
  });
  window();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) window(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
