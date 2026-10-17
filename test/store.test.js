const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store, money } = require("../src/store");
const D = require("../src/domain");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muhasebe-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(path.join(dir, "data.json"));
}
const contact = (s, type = "customer", extra = {}) => {
  s.add("contacts", {
    name: "Örnek cari",
    type,
    openingDate: "2026-01-01",
    ...extra,
  });
  return s.data.contacts.at(-1);
};
const product = (s) => {
  s.add("products", {
    name: "Ürün A",
    code: `UR-${s.data.products.length + 1}`,
    unit: "Adet",
    purchasePrice: "50",
    salePrice: "100",
    vatRate: "20",
    openingStock: "10",
  });
  return s.data.products.at(-1);
};
const account = (s) => {
  s.add("accounts", { name: "Ana kasa", type: "cash" });
  return s.data.accounts.at(-1);
};
function invoice(s, c, p, extra = {}) {
  s.add("invoices", {
    number: `F-${s.data.invoices.length + 1}`,
    description: "Ürün faturası",
    date: "2026-10-17",
    dueDate: "2026-10-30",
    type: "sale",
    contactId: c.id,
    items: [
      {
        productId: p.id,
        quantity: "2",
        unitPrice: "100",
        vatRate: "20",
        discount: "0",
      },
    ],
    ...extra,
  });
  return s.data.invoices.at(-1);
}
function payment(s, c, a, extra = {}) {
  s.add("transactions", {
    description: "Tahsilat",
    date: "2026-10-18",
    amount: "100",
    type: "income",
    contactId: c.id,
    accountId: a.id,
    ...extra,
  });
  return s.data.transactions.at(-1);
}

test("Kuruş hesabı ve geçersiz tutar sınırları", () => {
  assert.equal(money("12,34"), 1234);
  assert.equal(money("0.29"), 29);
  for (const n of [
    "-1",
    "0",
    "1.123",
    "abc",
    "Infinity",
    "99999999999999999999",
  ])
    assert.throws(() => money(n));
});
test("Üç ondalık miktar, iskonto ve KDV kuruşa yuvarlanır", () => {
  const l = D.line({
    quantity: "1,125",
    unitPrice: "10,01",
    discount: "10",
    vatRate: "20",
  });
  assert.equal(l.quantityMilli, 1125);
  assert.equal(l.discountAmount, 113);
  assert.equal(l.subtotal, 1013);
  assert.equal(l.vatAmount, 203);
  assert.equal(l.amount, 1216);
  assert.throws(() => D.line({ quantity: "1.0001", unitPrice: "10" }));
  assert.throws(() =>
    D.line({ quantity: "1", unitPrice: "10", vatRate: "101" }),
  );
});
test("Satış, kısmi tahsilat, cari net bakiye ve stok birlikte güncellenir", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  assert.equal(i.amount, 24000);
  assert.equal(D.balance(s.data, c.id), 24000);
  assert.equal(D.stock(s.data, p.id), 8000);
  assert.equal(s.data.transactions.length, 0);
  payment(s, c, a, { invoiceId: i.id });
  assert.equal(D.balance(s.data, c.id), 14000);
  assert.equal(D.paid(s.data, i.id), 10000);
  payment(s, c, a, { invoiceId: i.id, amount: "140" });
  assert.equal(D.balance(s.data, c.id), 0);
  assert.equal(D.paid(s.data, i.id), 24000);
  assert.equal(new Store(s.file).data.transactions.length, 2);
});
test("Alış faturası borcu ve stoğu artırır, ödeme borcu azaltır", (t) => {
  const s = setup(t),
    c = contact(s, "supplier"),
    p = product(s),
    a = account(s);
  const i = invoice(s, c, p, { type: "purchase" });
  assert.equal(D.balance(s.data, c.id), -24000);
  assert.equal(D.stock(s.data, p.id), 12000);
  payment(s, c, a, { type: "expense", amount: "80", invoiceId: i.id });
  assert.equal(D.balance(s.data, c.id), -16000);
  assert.equal(s.data.transactions[0].type, "expense");
});
test("Avans cari bakiyesine girer; faturaya otomatik dağıtılmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s);
  payment(s, c, a, { amount: "50" });
  const i = invoice(s, c, p);
  assert.equal(D.balance(s.data, c.id), 19000);
  assert.equal(D.paid(s.data, i.id), 0);
});
test("Fatura kalanını aşan, yanlış cariye veya yöne bağlı ödeme reddedilir", (t) => {
  const s = setup(t),
    c = contact(s),
    other = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  assert.throws(
    () => payment(s, c, a, { invoiceId: i.id, amount: "241" }),
    /aşıyor/,
  );
  assert.throws(() => payment(s, other, a, { invoiceId: i.id }), /uyuşmuyor/);
  assert.throws(
    () => payment(s, c, a, { invoiceId: i.id, type: "expense" }),
    /uyuşmuyor/,
  );
  assert.equal(s.data.transactions.length, 0);
});
test("Açılış bakiyesi kasa hareketi üretmez, ekstre kronolojik hesaplanır", (t) => {
  const s = setup(t),
    c = contact(s, "both", { openingAmount: "100", openingSide: "receivable" }),
    a = account(s);
  payment(s, c, a, { amount: "20", date: "2026-05-01" });
  payment(s, c, a, { type: "expense", amount: "5", date: "2026-03-01" });
  assert.deepEqual(
    D.ledger(s.data, c.id).map((r) => r.balance),
    [10000, 10500, 8500],
  );
  assert.equal(s.data.transactions.length, 2);
});
test("Cari sınıflandırması aynı cariye alış ve satış kaydını engellemez", (t) => {
  const s = setup(t),
    c = contact(s),
    both = contact(s, "both"),
    p = product(s);
  invoice(s, c, p, { type: "purchase" });
  invoice(s, c, p);
  assert.equal(D.balance(s.data, c.id), 0);
  invoice(s, both, p);
  invoice(s, both, p, { type: "purchase" });
  assert.equal(D.balance(s.data, both.id), 0);
});
test("Mükerrer kodlar ve fatura numaraları reddedilir", (t) => {
  const s = setup(t),
    c = contact(s, "customer", { code: "CR-1" }),
    p = product(s);
  assert.throws(() => contact(s, "customer", { code: "cr-1" }), /zaten/);
  assert.throws(
    () => s.add("products", { code: p.code, name: "Yinelenen", unit: "Adet" }),
    /zaten/,
  );
  invoice(s, c, p, { number: "SAT-1" });
  assert.throws(() => invoice(s, c, p, { number: "sat-1" }), /zaten/);
});
test("Geçersiz tarih, vade, hesap, ürün veya miktar hiçbir hareket oluşturmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s);
  for (const extra of [
    { date: "2026-02-30" },
    { dueDate: "2026-10-01" },
    { items: [] },
    { items: [{ productId: "missing", quantity: "1", unitPrice: "1" }] },
    { items: [{ productId: p.id, quantity: "-1", unitPrice: "1" }] },
  ])
    assert.throws(() => invoice(s, c, p, extra));
  assert.throws(() => payment(s, c, a, { accountId: "missing" }));
  assert.equal(s.data.invoices.length, 0);
  assert.equal(s.data.transactions.length, 0);
  assert.equal(D.stock(s.data, p.id), 10000);
});
test("Silme referansları korur, ödeme ve faturanın kaldırılması bakiyeleri geri alır", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  const t1 = payment(s, c, a, { invoiceId: i.id });
  for (const [kind, id] of [
    ["contacts", c.id],
    ["accounts", a.id],
    ["products", p.id],
    ["invoices", i.id],
  ])
    assert.throws(() => s.remove(kind, id));
  s.remove("transactions", t1.id);
  assert.equal(D.paid(s.data, i.id), 0);
  s.remove("invoices", i.id);
  assert.equal(D.balance(s.data, c.id), 0);
  assert.equal(D.stock(s.data, p.id), 10000);
});
test("Fatura satırları ürün kartının sonraki fiyat değişikliğinden etkilenmez", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    i = invoice(s, c, p);
  s.update("products", p.id, {
    code: p.code,
    name: "Yeni ad",
    unit: "Adet",
    salePrice: "200",
    purchasePrice: "60",
    vatRate: "10",
    openingStock: "10",
  });
  assert.equal(s.data.invoices[0].items[0].name, "Ürün A");
  assert.equal(s.data.invoices[0].amount, i.amount);
  assert.throws(
    () =>
      s.update("products", p.id, { code: p.code, name: "Yeni", unit: "Kg" }),
    /birimi/,
  );
});
test("Cari düzenleme kodu, sınıflandırma ve devir bakiyesini günceller", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s);
  invoice(s, c, p);
  const input = {
    name: "Yeni unvan",
    type: "customer",
    code: "CR-9",
    openingAmount: "5",
    openingSide: "payable",
    openingDate: "2026-01-01",
  };
  s.update("contacts", c.id, input);
  assert.equal(D.balance(s.data, c.id), 23500);
  s.update("contacts", c.id, { ...input, type: "supplier" });
  assert.equal(D.balance(s.data, c.id), 23500);
});
test("Eski sürüm dosyası yedeklenir; toplam fatura ve kasa hareketleri aynen kalır", (t) => {
  const s = setup(t);
  const legacy = {
    version: 1,
    contacts: [{ id: "c", name: "Eski cari", type: "customer" }],
    accounts: [{ id: "a", name: "Kasa", type: "cash" }],
    invoices: [
      {
        id: "i",
        number: "ESKI-1",
        contactId: "c",
        date: "2025-01-01",
        amount: 5000,
        type: "sale",
      },
    ],
    transactions: [
      {
        id: "t",
        date: "2025-01-02",
        amount: 1000,
        type: "income",
        accountId: "a",
      },
    ],
  };
  fs.mkdirSync(path.dirname(s.file), { recursive: true });
  fs.writeFileSync(s.file, JSON.stringify(legacy));
  const migrated = new Store(s.file);
  assert.deepEqual(JSON.parse(fs.readFileSync(s.file + ".v1-backup")), legacy);
  assert.equal(migrated.data.version, 2);
  assert.deepEqual(migrated.data.invoices, legacy.invoices);
  assert.deepEqual(migrated.data.transactions, legacy.transactions);
  assert.equal(D.balance(migrated.data, "c"), 5000);
  assert.equal(new Store(s.file).data.version, 2);
});
test("Önceki geçiş yedeği varsa üzerine yazılmaz", (t) => {
  const s = setup(t);
  fs.writeFileSync(
    s.file,
    JSON.stringify({
      version: 1,
      contacts: [],
      accounts: [],
      invoices: [],
      transactions: [],
    }),
  );
  fs.writeFileSync(s.file + ".v1-backup", "korunacak");
  new Store(s.file);
  assert.equal(fs.readFileSync(s.file + ".v1-backup", "utf8"), "korunacak");
});
test("Bozuk dosya sessizce sıfırlanmaz", (t) => {
  const s = setup(t);
  fs.writeFileSync(s.file, "broken");
  assert.throws(() => new Store(s.file));
  assert.equal(fs.readFileSync(s.file, "utf8"), "broken");
});
test("Kapanmış faturanın tahsilatı düzenlenirken kendi tutarı iki kez sayılmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  const txn = payment(s, c, a, { amount: "240", invoiceId: i.id });
  const input = {
    description: "Düzeltilmiş açıklama",
    date: txn.date,
    type: txn.type,
    amount: "240",
    contactId: c.id,
    invoiceId: i.id,
    accountId: a.id,
  };
  s.update("transactions", txn.id, input);
  assert.equal(D.paid(s.data, i.id), 24000);
  assert.equal(D.balance(s.data, c.id), 0);
  assert.throws(
    () => s.update("transactions", txn.id, { ...input, amount: "241" }),
    /aşıyor/,
  );
  assert.equal(s.data.transactions.length, 1);
});
test("Eski bağımsız tahsilat cariye ve faturaya bağlanırken kasa hareketi çoğalmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  s.add("transactions", {
    description: "Önceki tahsilat",
    date: "2026-10-18",
    amount: "100",
    type: "income",
    accountId: a.id,
  });
  const txn = s.data.transactions[0];
  s.update("transactions", txn.id, {
    ...txn,
    amount: "100",
    contactId: c.id,
    invoiceId: i.id,
  });
  assert.equal(s.data.transactions.length, 1);
  assert.equal(s.data.transactions[0].amount, 10000);
  assert.equal(D.balance(s.data, c.id), 14000);
});
test("Stoksuz satış ve alış cari hesaba işler ama ürün veya stok hareketi oluşturmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    before = D.stock(s.data, p.id);
  const input = {
    type: "sale",
    contactId: c.id,
    number: "SS-1",
    date: "2026-10-01",
    dueDate: "2026-10-30",
    description: "Montaj hizmeti",
    stockless: true,
    netAmount: "100",
    discount: "10",
    vatRate: "20",
    documentNo: "BELGE-1",
    group: "Hizmet",
  };
  s.add("invoices", input);
  assert.equal(s.data.invoices[0].amount, 10800);
  assert.equal(s.data.invoices[0].items.length, 0);
  assert.equal(D.stock(s.data, p.id), before);
  assert.equal(D.balance(s.data, c.id), 10800);
  s.add("invoices", { ...input, type: "purchase", number: "SA-1" });
  assert.equal(D.balance(s.data, c.id), 0);
  assert.equal(D.stock(s.data, p.id), before);
  const row = D.ledger(s.data, c.id).find((r) => r.invoiceNo === "SS-1");
  assert.equal(row.type, "STOKSUZ SATIŞ");
  assert.equal(row.documentNo, "BELGE-1");
  assert.equal(row.group, "Hizmet");
});
test("Stoksuz fatura ürün kartı olmadan girilebilir ve hatalı tutar reddedilir", (t) => {
  const s = setup(t),
    c = contact(s);
  const input = {
    type: "sale",
    contactId: c.id,
    number: "SS-1",
    date: "2026-10-01",
    description: "Hizmet",
    stockless: true,
    netAmount: "100",
    vatRate: "20",
  };
  s.add("invoices", input);
  assert.equal(s.data.products.length, 0);
  assert.equal(s.data.invoices[0].amount, 12000);
  assert.throws(() =>
    s.add("invoices", { ...input, number: "SS-2", netAmount: "-1" }),
  );
  assert.throws(
    () =>
      s.add("invoices", {
        ...input,
        number: "SS-2",
        items: [{ productId: "x" }],
      }),
    /Stoksuz/,
  );
  assert.equal(s.data.invoices.length, 1);
});
test("Süzgeç tarih, tür ve Türkçe metin ile çalışır; satır bakiyesi yeniden hesaplanmaz", (t) => {
  const s = setup(t),
    c = contact(s, "customer", {
      openingAmount: "100",
      openingSide: "receivable",
    }),
    p = product(s),
    a = account(s);
  invoice(s, c, p);
  payment(s, c, a, { description: "İşçilik ödemesi" });
  const rows = D.ledger(s.data, c.id),
    only = D.filterLedger(rows, {
      from: "2026-10-18",
      operation: "income",
      query: "işçilik",
    });
  assert.equal(only.length, 1);
  assert.equal(only[0].balance, 24000);
  assert.equal(D.filterLedger(rows, { to: "2026-01-01" }).length, 1);
  assert.equal(
    D.filterLedger(rows, { sort: "amount", desc: false })[0].amount,
    10000,
  );
  assert.equal(rows[0].operation, "opening");
});
test("Fiş ve işlem numaraları kalıcıdır, belge bilgileri düzenlemede korunur", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  const txn = payment(s, c, a, {
    invoiceId: i.id,
    documentNo: "DOC-1",
    group: "Banka",
  });
  assert.ok(txn.entryNo > i.entryNo);
  assert.match(txn.receiptNo, /^TAH-/);
  s.update("transactions", txn.id, { ...txn, amount: "100" });
  assert.equal(s.data.transactions[0].entryNo, txn.entryNo);
  assert.equal(s.data.transactions[0].documentNo, "DOC-1");
  assert.equal(new Store(s.file).data.transactions[0].receiptNo, txn.receiptNo);
});
test("Bakiye kontrolü tutarlı kayıtları ve bozuk fatura/kasa bağlantılarını ayırır", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    i = invoice(s, c, p);
  payment(s, c, a, { invoiceId: i.id });
  assert.deepEqual(D.auditContact(s.data, c.id).issues, []);
  const corrupted = structuredClone(s.data);
  corrupted.invoices[0].items[0].amount = 1;
  corrupted.transactions[0].accountId = "missing";
  const audit = D.auditContact(corrupted, c.id);
  assert.equal(audit.issues.length, 2);
  assert.equal(audit.balance, 14000);
});
test("CSV dışa aktarımı Türkçe başlık, süzgeç ve formül/alıntı kaçışını korur", (t) => {
  const s = setup(t),
    c = contact(s),
    a = account(s);
  payment(s, c, a, { description: '=HYPERLINK("x");Tehlike' });
  const csv = D.ledgerCsv(s.data, c.id);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes("Cari türü"));
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('""x""'));
  assert.equal(
    D.ledgerCsv(s.data, c.id, { operation: "purchase" }).split("\r\n").length,
    1,
  );
});

test("Cari ve üç satır iskontosu sırayla uygulanır; KDV dahil fiyat ayrıştırılır", () => {
  const l = D.line({
    quantity: "2",
    unitPrice: "120",
    currency: "USD",
    exchangeRate: "40",
    vatRate: "20",
    vatIncluded: true,
    contactDiscount: "10",
    discount: "10",
    discount2: "5",
    discount3: "2",
  });
  assert.equal(l.unitPriceTL, 480000);
  assert.equal(l.gross, 800000);
  assert.equal(l.subtotal, 603288);
  assert.equal(l.vatAmount, 120658);
  assert.equal(l.amount, 723946);
  assert.equal(l.discountAmount, 196712);
  assert.equal(l.subtotal + l.vatAmount, l.amount);
  assert.equal(l.gross - l.discountAmount, l.subtotal);
});
test("Döviz kuru pozitif ve en fazla altı ondalık olmalı; tek sayılı bölenle fiyat çevrimi", () => {
  assert.equal(D.exchangeRate("49,443333"), 49443333);
  for (const rate of ["0", "-1", "1.0000001", "NaN"])
    assert.throws(() =>
      D.line({
        quantity: "1",
        unitPrice: "1",
        currency: "EUR",
        exchangeRate: rate,
      }),
    );
  assert.equal(D.convertPrice(100, 1000000, 49443333), 2);
  assert.throws(() =>
    D.line({
      quantity: "1",
      unitPrice: "1",
      currency: "GBP",
      exchangeRate: "1",
    }),
  );
});
test("Çok satırlı stoksuz peşin satış faturası ile tahsilat tek kayıtta kalıcılaşır", (t) => {
  const s = setup(t),
    c = contact(s),
    a = account(s);
  s.add("invoices", {
    number: "PES-1",
    description: "Hizmetler",
    date: "2026-10-17",
    dueDate: "2026-10-17",
    contactId: c.id,
    type: "sale",
    stockless: true,
    cashSale: true,
    cashAccountId: a.id,
    contactDiscount: "10",
    currency: "USD",
    exchangeRates: { USD: "40" },
    salesperson: "Örnek Yetkili",
    lines: [
      {
        name: "Kurulum",
        unit: "Saat",
        quantity: "2",
        unitPrice: "120",
        vatRate: "20",
        vatIncluded: true,
        discount: "10",
        discount2: "5",
        discount3: "2",
      },
      { name: "Sarf", quantity: "1", unitPrice: "10", vatRate: "20" },
    ],
  });
  const i = s.data.invoices[0];
  assert.equal(i.amount, 767146);
  assert.equal(i.serviceLines.length, 2);
  assert.equal(i.salesperson, "Örnek Yetkili");
  assert.equal(s.data.transactions.length, 1);
  assert.equal(D.paid(s.data, i.id), i.amount);
  assert.equal(D.balance(s.data, c.id), 0);
  assert.equal(s.data.transactions[0].amount, 767146);
  assert.equal(new Store(s.file).data.invoices[0].exchangeRates.USD, 40000000);
});
test("Peşin alış kasa çıkışı oluşturur; geçersiz hesapta fatura veya stok yazılmaz", (t) => {
  const s = setup(t),
    c = contact(s),
    p = product(s),
    a = account(s),
    before = fs.readFileSync(s.file, "utf8");
  assert.throws(
    () => invoice(s, c, p, { cashSale: true, cashAccountId: "missing" }),
    /kasa/,
  );
  assert.equal(fs.readFileSync(s.file, "utf8"), before);
  assert.equal(D.stock(s.data, p.id), 10000);
  const i = invoice(s, c, p, {
    type: "purchase",
    cashSale: true,
    cashAccountId: a.id,
  });
  assert.equal(s.data.transactions[0].type, "expense");
  assert.equal(D.paid(s.data, i.id), 24000);
  assert.equal(D.balance(s.data, c.id), 0);
  assert.equal(D.stock(s.data, p.id), 12000);
});
test("Karma para biriminde kur anlık değerleri sabitlenir; eksik kur kaydı engeller", (t) => {
  const s = setup(t),
    c = contact(s);
  const input = {
    number: "KUR-1",
    description: "Karma",
    date: "2026-10-17",
    type: "sale",
    contactId: c.id,
    stockless: true,
    fixedCurrency: false,
    currency: "TL",
    exchangeRates: { USD: "40", EUR: "45" },
    lines: [
      {
        name: "Dolar hizmet",
        quantity: "1",
        unitPrice: "10",
        vatRate: "0",
        currency: "USD",
      },
      {
        name: "Euro hizmet",
        quantity: "1",
        unitPrice: "10",
        vatRate: "20",
        currency: "EUR",
      },
    ],
  };
  s.add("invoices", input);
  assert.equal(s.data.invoices[0].amount, 94000);
  assert.deepEqual(
    D.invoiceLines(s.data.invoices[0]).map((l) => l.currency),
    ["USD", "EUR"],
  );
  assert.throws(
    () =>
      s.add("invoices", {
        ...input,
        number: "KUR-2",
        exchangeRates: { USD: "40" },
      }),
    /kur/,
  );
  assert.equal(s.data.invoices.length, 1);
});
test("Ek PDF JSON yedeğine dahil olur ve bozuk/uygunsuz dosya kaydı engellenir", (t) => {
  const s = setup(t),
    c = contact(s),
    pdf = Buffer.from("%PDF-1.4\nörnek belge").toString("base64");
  const input = {
    number: "EK-1",
    description: "Ekli fatura",
    date: "2026-10-17",
    type: "sale",
    contactId: c.id,
    stockless: true,
    netAmount: "100",
    attachments: [{ name: "ornek.pdf", base64: pdf }],
  };
  s.add("invoices", input);
  assert.equal(new Store(s.file).data.invoices[0].attachments[0].base64, pdf);
  assert.ok(s.data.invoices[0].attachments[0].id);
  for (const attachment of [
    { name: "x.exe", base64: pdf },
    { name: "x.pdf", base64: Buffer.from("not pdf").toString("base64") },
    { name: "../x.pdf", base64: pdf },
  ])
    assert.throws(() =>
      s.add("invoices", {
        ...input,
        number: "EK-2",
        attachments: [attachment],
      }),
    );
  assert.equal(s.data.invoices.length, 1);
});
test("Barkod ve cari kartı iskonto bilgileri saklanır; barkod başka kartta yinelenmez", (t) => {
  const s = setup(t),
    c = contact(s, "customer", { discount: "5" }),
    p = product(s);
  s.update("products", p.id, {
    code: p.code,
    name: p.name,
    unit: p.unit,
    barcode: "869000123",
    specialCode: "MASA",
    salePrice: "100",
    purchasePrice: "50",
    vatRate: "20",
    openingStock: "10",
  });
  assert.equal(s.data.contacts[0].discountBps, 500);
  assert.equal(s.data.products[0].barcode, "869000123");
  assert.throws(
    () =>
      s.add("products", {
        code: "DIĞER",
        name: "Diğer",
        unit: "Adet",
        barcode: "869000123",
      }),
    /Barkod/,
  );
});
