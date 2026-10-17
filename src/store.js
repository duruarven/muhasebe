const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const D = require("./domain");
const kinds = ["contacts", "accounts", "transactions", "invoices", "products"];
const empty = () => ({
  version: 2,
  contacts: [],
  accounts: [],
  transactions: [],
  invoices: [],
  products: [],
});
function text(value, name, optional = false) {
  if (optional && (value == null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.length > 300)
    throw Error(`${name} gerekli (en fazla 300 karakter).`);
  return value.trim();
}
function date(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Geçerli bir tarih girin.");
  return value;
}
class Store {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : empty();
    if (
      ![1, 2].includes(this.data.version) ||
      ["contacts", "accounts", "transactions", "invoices"].some(
        (k) => !Array.isArray(this.data[k]),
      ) ||
      (this.data.version === 2 && !Array.isArray(this.data.products))
    )
      throw Error(
        "Veri dosyası biçimi geçersiz. Dosyanız korundu; yedeğinizden yardım alın.",
      );
    if (this.data.version === 1) {
      // Migration does not fabricate invoice lines, stock, payments or cash movements.
      const backup = fs.existsSync(file + ".v1-backup")
        ? file + ".v1-backup." + randomUUID()
        : file + ".v1-backup";
      fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
      this.save({ ...this.data, version: 2, products: [] });
    }
  }
  save(data) {
    // Verify aggregates before replacing the last valid state.
    for (const c of data.contacts) D.balance(data, c.id);
    for (const p of data.products) D.stock(data, p.id);
    data.transactions.reduce(
      (s, t) => D.safe(s + (t.type === "income" ? t.amount : -t.amount)),
      0,
    );
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
    this.data = data;
  }
  contact(id) {
    const c = this.data.contacts.find((c) => c.id === id);
    if (!c) throw Error("Cari bulunamadı.");
    return c;
  }
  prepare(kind, input, old) {
    if (!input || typeof input !== "object")
      throw Error("Kayıt bilgileri geçersiz.");
    const row = {
      id: old?.id || randomUUID(),
      createdAt: old?.createdAt || new Date().toISOString(),
    };
    if (kind === "transactions" || kind === "invoices") {
      const records = [...this.data.invoices, ...this.data.transactions];
      row.entryNo =
        old?.entryNo ||
        records.reduce(
          (max, r, index) => Math.max(max, r.entryNo || index + 1),
          0,
        ) + 1;
      for (const field of ["documentNo", "deliveryNo", "group"])
        row[field] = text(input[field], field, true);
    }
    if (kind === "contacts") {
      Object.assign(row, {
        name: text(input.name, "Cari unvanı"),
        type: input.type,
      });
      if (!["customer", "supplier", "both"].includes(row.type))
        throw Error("Cari türü geçersiz.");
      for (const field of [
        "code",
        "taxNumber",
        "taxOffice",
        "phone",
        "email",
        "address",
      ])
        row[field] = text(input[field], field, true);
      if (
        row.code &&
        this.data.contacts.some(
          (c) =>
            c.id !== row.id &&
            c.code?.toLocaleLowerCase("tr") ===
              row.code.toLocaleLowerCase("tr"),
        )
      )
        throw Error("Cari kodu zaten kayıtlı.");
      const opening = D.money(input.openingAmount || "0", true);
      if (opening && !["receivable", "payable"].includes(input.openingSide))
        throw Error("Açılış bakiyesi yönünü seçin.");
      row.openingBalance = opening * (input.openingSide === "payable" ? -1 : 1);
      row.openingDate = date(
        input.openingDate ||
          old?.openingDate ||
          new Date().toISOString().slice(0, 10),
      );
    } else if (kind === "accounts") {
      Object.assign(row, {
        name: text(input.name, "Hesap adı"),
        type: input.type,
      });
      if (!["cash", "bank"].includes(row.type))
        throw Error("Hesap türü geçersiz.");
    } else if (kind === "products") {
      Object.assign(row, {
        name: text(input.name, "Ürün adı"),
        code: text(input.code, "Ürün kodu"),
        unit: text(input.unit, "Birim"),
        purchasePrice: D.money(input.purchasePrice || "0", true),
        salePrice: D.money(input.salePrice || "0", true),
        vatBps: D.rate(input.vatRate ?? "20"),
        openingStock: D.quantity(input.openingStock || "0", true),
      });
      if (
        old &&
        old.unit !== row.unit &&
        this.data.invoices.some((i) =>
          i.items?.some((item) => item.productId === row.id),
        )
      )
        throw Error("Hareketi olan ürünün birimi değiştirilemez.");
      if (
        this.data.products.some(
          (p) =>
            p.id !== row.id &&
            p.code.toLocaleLowerCase("tr") === row.code.toLocaleLowerCase("tr"),
        )
      )
        throw Error("Ürün kodu zaten kayıtlı.");
    } else if (kind === "transactions") {
      Object.assign(row, {
        description: text(input.description, "Açıklama"),
        date: date(input.date),
        amount: D.money(input.amount),
        type: input.type,
        accountId: input.accountId,
      });
      if (!["income", "expense"].includes(row.type))
        throw Error("İşlem türü geçersiz.");
      if (!this.data.accounts.some((a) => a.id === row.accountId))
        throw Error("Bir kasa veya banka hesabı seçin.");
      if (input.contactId) {
        this.contact(input.contactId);
        row.contactId = input.contactId;
      }
      if (input.invoiceId) {
        const invoice = this.data.invoices.find(
          (i) => i.id === input.invoiceId,
        );
        if (
          !invoice ||
          invoice.contactId !== row.contactId ||
          invoice.type !== (row.type === "income" ? "sale" : "purchase")
        )
          throw Error("Fatura ile cari veya işlem yönü uyuşmuyor.");
        const alreadyPaid =
          D.paid(this.data, invoice.id) -
          (old?.invoiceId === invoice.id ? old.amount : 0);
        if (row.amount > invoice.amount - alreadyPaid)
          throw Error(
            "Tutar faturanın kalan bakiyesini aşıyor. Avans için faturasız işlem girin.",
          );
        row.invoiceId = invoice.id;
      }
      row.receiptNo =
        text(input.receiptNo, "Fiş numarası", true) ||
        `${row.type === "income" ? "TAH" : "ODE"}-${String(row.entryNo).padStart(5, "0")}`;
    } else if (kind === "invoices") {
      Object.assign(row, {
        description: text(input.description, "Açıklama"),
        date: date(input.date),
        type: input.type,
        contactId: input.contactId,
        number: text(input.number, "Fatura numarası"),
      });
      if (!["sale", "purchase"].includes(row.type))
        throw Error("Fatura türü geçersiz.");
      this.contact(row.contactId);
      if (
        this.data.invoices.some(
          (i) =>
            i.number.toLocaleLowerCase("tr") ===
              row.number.toLocaleLowerCase("tr") &&
            i.contactId === row.contactId &&
            i.type === row.type,
        )
      )
        throw Error("Bu cari için fatura numarası zaten kayıtlı.");
      row.dueDate = input.dueDate ? date(input.dueDate) : row.date;
      if (row.dueDate < row.date)
        throw Error("Vade tarihi fatura tarihinden önce olamaz.");
      row.receiptNo =
        text(input.receiptNo, "Fiş numarası", true) ||
        `${row.type === "sale" ? "SF" : "AF"}-${String(row.entryNo).padStart(5, "0")}`;
      row.stockless = input.stockless === true;
      if (row.stockless) {
        if (input.items?.length)
          throw Error("Stoksuz faturaya ürün satırı eklenemez.");
        row.items = [];
        row.serviceLine = {
          name: row.description,
          ...D.line({
            quantity: "1",
            unitPrice: input.netAmount,
            vatRate: input.vatRate ?? "20",
            discount: input.discount ?? "0",
          }),
        };
      } else {
        if (
          !Array.isArray(input.items) ||
          !input.items.length ||
          input.items.length > 100
        )
          throw Error("Faturaya 1–100 ürün satırı ekleyin.");
        row.items = input.items.map((item) => {
          const p = this.data.products.find((p) => p.id === item.productId);
          if (!p) throw Error("Fatura satırında geçerli bir ürün seçin.");
          return {
            productId: p.id,
            name: p.name,
            code: p.code,
            unit: p.unit,
            ...D.line(item),
          };
        });
      }
      const lines = row.stockless ? [row.serviceLine] : row.items;
      for (const field of ["subtotal", "vatAmount", "discountAmount", "amount"])
        row[field] = lines.reduce((s, item) => D.safe(s + item[field]), 0);
      if (row.amount <= 0) throw Error("Fatura toplamı sıfırdan büyük olmalı.");
    } else throw Error("Kayıt türü geçersiz.");
    return row;
  }
  add(kind, input) {
    const row = this.prepare(kind, input);
    this.save({ ...this.data, [kind]: [...this.data[kind], row] });
    return this.data;
  }
  update(kind, id, input) {
    if (!["contacts", "products", "accounts", "transactions"].includes(kind))
      throw Error(
        "Bu kayıt düzenlenemez. Hatalı hareketi silip yeniden girin.",
      );
    const old = this.data[kind].find((r) => r.id === id);
    if (!old) throw Error("Kayıt bulunamadı.");
    const row = this.prepare(kind, input, old);
    this.save({
      ...this.data,
      [kind]: this.data[kind].map((r) => (r.id === id ? row : r)),
    });
    return this.data;
  }
  remove(kind, id) {
    if (!kinds.includes(kind)) throw Error("Kayıt türü geçersiz.");
    if (!this.data[kind].some((r) => r.id === id))
      throw Error("Kayıt bulunamadı.");
    if (
      kind === "contacts" &&
      (this.data.invoices.some((i) => i.contactId === id) ||
        this.data.transactions.some((t) => t.contactId === id))
    )
      throw Error(
        "Hareketi olan cari silinemez. Önce bağlı fatura ve ödemeleri kaldırın.",
      );
    if (
      kind === "accounts" &&
      this.data.transactions.some((t) => t.accountId === id)
    )
      throw Error("Önce bu hesaba bağlı işlemleri silin.");
    if (
      kind === "products" &&
      this.data.invoices.some((i) =>
        i.items?.some((item) => item.productId === id),
      )
    )
      throw Error("Faturalarda kullanılan ürün silinemez.");
    if (
      kind === "invoices" &&
      this.data.transactions.some((t) => t.invoiceId === id)
    )
      throw Error("Önce faturaya bağlı tahsilat/ödemeleri kaldırın.");
    this.save({
      ...this.data,
      [kind]: this.data[kind].filter((r) => r.id !== id),
    });
    return this.data;
  }
}
module.exports = { Store, money: D.money };
