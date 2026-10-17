"use strict";
(() => {
  async function call(op, payload) {
    try {
      const response = await fetch(`/api/${op}`, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {});
      if (response.status === 401) { location.replace("/"); throw Error("Yeniden giriş yapın."); }
      return await response.json();
    } catch (error) { return { ok: false, error: "Bağlantı kurulamadı. Bilgisayarın ve programın açık olduğunu, aynı Wi-Fi ağında bulunduğunu kontrol et. " + error.message }; }
  }
  function download(url) {
    const link = document.createElement("a"); link.href = url; link.download = ""; document.body.append(link); link.click(); link.remove();
    return Promise.resolve({ ok: true, data: "Dosya indirme isteği gönderildi." });
  }
  window.accounting = {
    read: () => call("read"),
    add: (kind, input) => call("add", { kind, input }),
    update: (kind, id, input) => call("update", { kind, id, input }),
    remove: (kind, id) => call("remove", { kind, id }),
    backup: () => download("/api/backup"),
    exportLedger: (contactId, filters) => download(`/api/ledger?${new URLSearchParams({ contactId, filters: JSON.stringify(filters) })}`),
    openAttachment: (invoiceId, attachmentId) => download(`/api/attachment?${new URLSearchParams({ invoiceId, attachmentId })}`),
    print: () => { window.print(); return Promise.resolve({ ok: true }); },
    logout: async () => { const result = await call("logout", {}); if (result.ok) location.replace("/"); return result; },
    pickAttachments: () => new Promise(resolve => {
      const picker = document.createElement("input"); picker.type = "file"; picker.accept = ".pdf,.png,.jpg,.jpeg"; picker.multiple = true;
      picker.addEventListener("cancel", () => resolve({ ok: true, data: [] }));
      picker.addEventListener("change", async () => {
        try {
          const files = [...picker.files];
          if (files.length > 5) throw Error("En fazla 5 belge seçin.");
          const data = await Promise.all(files.map(file => new Promise((done, reject) => {
            if (file.size > 2 * 1024 * 1024) return reject(Error("Belge başına en fazla 2 MB eklenebilir."));
            const reader = new FileReader(); reader.onerror = () => reject(Error("Dosya okunamadı."));
            reader.onload = () => done({ name: file.name, base64: reader.result.split(",")[1] }); reader.readAsDataURL(file);
          })));
          resolve({ ok: true, data });
        } catch (error) { resolve({ ok: false, error: error.message }); }
      });
      picker.click();
    }),
  };
})();
