const D = require("./domain");
const { normalizeAttachments } = require("./attachments");
const kinds = ["contacts", "accounts", "products", "invoices", "transactions"];
function importBackup(store, input) {
  if (kinds.some(kind => store.data[kind].length))
    throw Error("Yedek aktarımı yalnızca boş sisteme yapılabilir. Mevcut kayıtların üzerine yazılmaz.");
  if (!input || ![1, 2].includes(input.version)) throw Error("Desteklenen muhasebe yedeğini seçin.");
  const data = { version: 2 };
  const ids = {};
  for (const kind of kinds) {
    const records = input[kind] ?? (kind === "products" && input.version === 1 ? [] : null);
    if (!Array.isArray(records)) throw Error("Yedek biçimi geçersiz.");
    data[kind] = JSON.parse(JSON.stringify(records));
    ids[kind] = new Set();
    for (const row of data[kind]) {
      if (!row || typeof row.id !== "string" || !row.id || ids[kind].has(row.id)) throw Error("Yedekte eksik veya yinelenen kayıt kimliği var.");
      ids[kind].add(row.id);
    }
  }
  const positive = amount => { D.safe(amount); if (amount <= 0) throw Error("Yedekte geçersiz tutar var."); };
  for (const c of data.contacts) {
    if (!["customer", "supplier", "both"].includes(c.type) || typeof c.name !== "string") throw Error("Cari kartı geçersiz.");
    D.safe(c.openingBalance || 0);
  }
  for (const a of data.accounts) if (!["cash", "bank"].includes(a.type)) throw Error("Kasa/banka türü geçersiz.");
  for (const p of data.products) D.safe(p.openingStock || 0);
  for (const i of data.invoices) {
    if (!["sale", "purchase"].includes(i.type) || !ids.contacts.has(i.contactId)) throw Error("Fatura/cari bağlantısı geçersiz.");
    positive(i.amount);
    const lines = D.invoiceLines(i);
    for (const line of lines) {
      D.safe(line.amount);
      if (line.quantityMilli !== undefined) positive(line.quantityMilli);
      if (!i.stockless && !ids.products.has(line.productId)) throw Error("Fatura/ürün bağlantısı geçersiz.");
    }
    if (lines.length && lines.reduce((sum, line) => D.safe(sum + line.amount), 0) !== i.amount) throw Error("Fatura satır toplamı uyuşmuyor.");
    if (i.attachments?.length) i.attachments = normalizeAttachments(i.attachments);
  }
  for (const t of data.transactions) {
    positive(t.amount);
    if (!["income", "expense"].includes(t.type) || !ids.accounts.has(t.accountId) || (t.contactId && !ids.contacts.has(t.contactId))) throw Error("Tahsilat/ödeme bağlantısı geçersiz.");
    if (t.invoiceId && !data.invoices.some(i => i.id === t.invoiceId && i.contactId === t.contactId && i.type === (t.type === "income" ? "sale" : "purchase"))) throw Error("Tahsilat/fatura bağlantısı geçersiz.");
  }
  for (const c of data.contacts) {
    const audit = D.auditContact(data, c.id);
    if (audit.issues.length) throw Error(audit.issues.join(" "));
  }
  store.save(data);
  return store.data;
}
module.exports = { importBackup };
