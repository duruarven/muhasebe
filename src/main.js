const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { Store } = require("./store");
const D = require("./domain");
const { randomUUID } = require("node:crypto");
const { normalizeAttachments, LIMIT } = require("./attachments");
app.commandLine.appendSwitch("lang", "tr-TR");
let store;
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
function window() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const trustedPage = pathToFileURL(path.join(__dirname, "index.html")).href;
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== trustedPage) event.preventDefault();
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
}
app.whenReady().then(() => {
  if (!primary) return;
  try {
    store = new Store(path.join(app.getPath("userData"), "muhasebe.json"));
  } catch (e) {
    dialog.showErrorBox("Veriler açılamadı", e.message);
    app.quit();
    return;
  }
  const handle = (name, fn) =>
    ipcMain.handle(name, async (_event, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  handle("data:read", () => store.data);
  handle("data:add", (kind, input) => store.add(kind, input));
  handle("data:update", (kind, id, input) => store.update(kind, id, input));
  handle("data:remove", (kind, id) => store.remove(kind, id));
  ipcMain.handle(
    "data:print",
    (event) =>
      new Promise((resolve) => {
        event.sender.print(
          { silent: false, printBackground: true },
          (ok, reason) =>
            resolve(
              ok
                ? { ok: true }
                : { ok: false, error: reason || "Yazdırma iptal edildi." },
            ),
        );
      }),
  );
  handle("data:pick-attachments", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Ek belge seçin (PDF / resim, en fazla 2 MB)",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "PDF ve resim", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    if (selection.canceled) return [];
    if (selection.filePaths.length > 5) throw Error("En fazla 5 belge seçin.");
    return normalizeAttachments(
      selection.filePaths.map((file) => {
        const info = fs.statSync(file);
        if (!info.isFile() || info.size > LIMIT)
          throw Error("Belge başına en fazla 2 MB eklenebilir.");
        return {
          name: path.basename(file),
          base64: fs.readFileSync(file).toString("base64"),
        };
      }),
    );
  });
  handle("data:open-attachment", async (invoiceId, attachmentId) => {
    const invoice = store.data.invoices.find((i) => i.id === invoiceId);
    const attachment = invoice?.attachments?.find((a) => a.id === attachmentId);
    if (!attachment) throw Error("Ek belge bulunamadı.");
    const [checked] = normalizeAttachments([attachment]);
    const dir = path.join(app.getPath("temp"), "isletmem-belgeler");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      randomUUID() + path.extname(checked.name).toLowerCase(),
    );
    fs.writeFileSync(file, Buffer.from(checked.base64, "base64"), {
      mode: 0o600,
      flag: "wx",
    });
    const error = await shell.openPath(file);
    if (error) throw Error(error);
    return null;
  });
  handle("data:export-ledger", async (contactId, filters) => {
    const contact = store.contact(contactId);
    const filename = (contact.code || contact.name)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
    const result = await dialog.showSaveDialog({
      title: "Cari ekstresini CSV kaydet",
      defaultPath: `cari-ekstresi-${filename}.csv`,
      filters: [{ name: "Excel ile açılabilen CSV", extensions: ["csv"] }],
    });
    if (result.canceled) return null;
    fs.writeFileSync(
      result.filePath,
      D.ledgerCsv(store.data, contactId, filters),
    );
    return "Görüntülenen cari ekstresi CSV dosyasına kaydedildi.";
  });
  handle("data:backup", async () => {
    const result = await dialog.showSaveDialog({
      title: "Yedeği kaydet",
      defaultPath: `muhasebe-yedek-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON yedek", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(store.data, null, 2));
    return "Yedek kaydedildi.";
  });
  window();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) window();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
