const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, money } = require('../src/store');
const D = require('../src/domain');
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muhasebe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(path.join(dir, 'data.json'));
}
const contact = (s, type = 'customer', extra = {}) => { s.add('contacts', { name: 'Örnek cari', type, openingDate: '2026-01-01', ...extra }); return s.data.contacts.at(-1); };
const product = s => { s.add('products', { name: 'Ürün A', code: `UR-${s.data.products.length + 1}`, unit: 'Adet', purchasePrice: '50', salePrice: '100', vatRate: '20', openingStock: '10' }); return s.data.products.at(-1); };
const account = s => { s.add('accounts', { name: 'Ana kasa', type: 'cash' }); return s.data.accounts.at(-1); };
function invoice(s, c, p, extra = {}) { s.add('invoices', { number: `F-${s.data.invoices.length + 1}`, description: 'Ürün faturası', date: '2026-10-17', dueDate: '2026-10-30', type: 'sale', contactId: c.id, items: [{ productId: p.id, quantity: '2', unitPrice: '100', vatRate: '20', discount: '0' }], ...extra }); return s.data.invoices.at(-1); }
function payment(s, c, a, extra = {}) { s.add('transactions', { description: 'Tahsilat', date: '2026-10-18', amount: '100', type: 'income', contactId: c.id, accountId: a.id, ...extra }); return s.data.transactions.at(-1); }

test('Kuruş hesabı ve geçersiz tutar sınırları', () => {
  assert.equal(money('12,34'), 1234); assert.equal(money('0.29'), 29);
  for (const n of ['-1', '0', '1.123', 'abc', 'Infinity', '99999999999999999999']) assert.throws(() => money(n));
});
test('Üç ondalık miktar, iskonto ve KDV kuruşa yuvarlanır', () => {
  const l = D.line({ quantity: '1,125', unitPrice: '10,01', discount: '10', vatRate: '20' });
  assert.equal(l.quantityMilli, 1125); assert.equal(l.discountAmount, 113); assert.equal(l.subtotal, 1013); assert.equal(l.vatAmount, 203); assert.equal(l.amount, 1216);
  assert.throws(() => D.line({ quantity: '1.0001', unitPrice: '10' }));
  assert.throws(() => D.line({ quantity: '1', unitPrice: '10', vatRate: '101' }));
});
test('Satış, kısmi tahsilat, cari net bakiye ve stok birlikte güncellenir', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s), i = invoice(s, c, p);
  assert.equal(i.amount, 24000); assert.equal(D.balance(s.data, c.id), 24000); assert.equal(D.stock(s.data, p.id), 8000);
  assert.equal(s.data.transactions.length, 0);
  payment(s, c, a, { invoiceId: i.id });
  assert.equal(D.balance(s.data, c.id), 14000); assert.equal(D.paid(s.data, i.id), 10000);
  payment(s, c, a, { invoiceId: i.id, amount: '140' });
  assert.equal(D.balance(s.data, c.id), 0); assert.equal(D.paid(s.data, i.id), 24000);
  assert.equal(new Store(s.file).data.transactions.length, 2);
});
test('Alış faturası borcu ve stoğu artırır, ödeme borcu azaltır', t => {
  const s = setup(t), c = contact(s, 'supplier'), p = product(s), a = account(s);
  const i = invoice(s, c, p, { type: 'purchase' });
  assert.equal(D.balance(s.data, c.id), -24000); assert.equal(D.stock(s.data, p.id), 12000);
  payment(s, c, a, { type: 'expense', amount: '80', invoiceId: i.id });
  assert.equal(D.balance(s.data, c.id), -16000); assert.equal(s.data.transactions[0].type, 'expense');
});
test('Avans cari bakiyesine girer; faturaya otomatik dağıtılmaz', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s);
  payment(s, c, a, { amount: '50' }); const i = invoice(s, c, p);
  assert.equal(D.balance(s.data, c.id), 19000); assert.equal(D.paid(s.data, i.id), 0);
});
test('Fatura kalanını aşan, yanlış cariye veya yöne bağlı ödeme reddedilir', t => {
  const s = setup(t), c = contact(s), other = contact(s), p = product(s), a = account(s), i = invoice(s, c, p);
  assert.throws(() => payment(s, c, a, { invoiceId: i.id, amount: '241' }), /aşıyor/);
  assert.throws(() => payment(s, other, a, { invoiceId: i.id }), /uyuşmuyor/);
  assert.throws(() => payment(s, c, a, { invoiceId: i.id, type: 'expense' }), /uyuşmuyor/);
  assert.equal(s.data.transactions.length, 0);
});
test('Açılış bakiyesi kasa hareketi üretmez, ekstre kronolojik hesaplanır', t => {
  const s = setup(t), c = contact(s, 'both', { openingAmount: '100', openingSide: 'receivable' }), a = account(s);
  payment(s, c, a, { amount: '20', date: '2026-05-01' });
  payment(s, c, a, { type: 'expense', amount: '5', date: '2026-03-01' });
  assert.deepEqual(D.ledger(s.data, c.id).map(r => r.balance), [10000, 10500, 8500]);
  assert.equal(s.data.transactions.length, 2);
});
test('Müşteri ve tedarikçi türü kontrol edilir, karma cari her iki faturayı destekler', t => {
  const s = setup(t), c = contact(s), both = contact(s, 'both'), p = product(s);
  assert.throws(() => invoice(s, c, p, { type: 'purchase' }), /uygun/);
  invoice(s, both, p); invoice(s, both, p, { type: 'purchase' });
  assert.equal(D.balance(s.data, both.id), 0);
});
test('Mükerrer kodlar ve fatura numaraları reddedilir', t => {
  const s = setup(t), c = contact(s, 'customer', { code: 'CR-1' }), p = product(s);
  assert.throws(() => contact(s, 'customer', { code: 'cr-1' }), /zaten/);
  assert.throws(() => s.add('products', { code: p.code, name: 'Yinelenen', unit: 'Adet' }), /zaten/);
  invoice(s, c, p, { number: 'SAT-1' });
  assert.throws(() => invoice(s, c, p, { number: 'sat-1' }), /zaten/);
});
test('Geçersiz tarih, vade, hesap, ürün veya miktar hiçbir hareket oluşturmaz', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s);
  for (const extra of [{ date: '2026-02-30' }, { dueDate: '2026-10-01' }, { items: [] }, { items: [{ productId: 'missing', quantity: '1', unitPrice: '1' }] }, { items: [{ productId: p.id, quantity: '-1', unitPrice: '1' }] }]) assert.throws(() => invoice(s, c, p, extra));
  assert.throws(() => payment(s, c, a, { accountId: 'missing' }));
  assert.equal(s.data.invoices.length, 0); assert.equal(s.data.transactions.length, 0); assert.equal(D.stock(s.data, p.id), 10000);
});
test('Silme referansları korur, ödeme ve faturanın kaldırılması bakiyeleri geri alır', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s), i = invoice(s, c, p);
  const t1 = payment(s, c, a, { invoiceId: i.id });
  for (const [kind, id] of [['contacts', c.id], ['accounts', a.id], ['products', p.id], ['invoices', i.id]]) assert.throws(() => s.remove(kind, id));
  s.remove('transactions', t1.id); assert.equal(D.paid(s.data, i.id), 0);
  s.remove('invoices', i.id); assert.equal(D.balance(s.data, c.id), 0); assert.equal(D.stock(s.data, p.id), 10000);
});
test('Fatura satırları ürün kartının sonraki fiyat değişikliğinden etkilenmez', t => {
  const s = setup(t), c = contact(s), p = product(s), i = invoice(s, c, p);
  s.update('products', p.id, { code: p.code, name: 'Yeni ad', unit: 'Adet', salePrice: '200', purchasePrice: '60', vatRate: '10', openingStock: '10' });
  assert.equal(s.data.invoices[0].items[0].name, 'Ürün A'); assert.equal(s.data.invoices[0].amount, i.amount);
  assert.throws(() => s.update('products', p.id, { code: p.code, name: 'Yeni', unit: 'Kg' }), /birimi/);
});
test('Cari düzenleme kodu ve devir bakiyesini günceller, faturaya aykırı türü engeller', t => {
  const s = setup(t), c = contact(s), p = product(s); invoice(s, c, p);
  const input = { name: 'Yeni unvan', type: 'customer', code: 'CR-9', openingAmount: '5', openingSide: 'payable', openingDate: '2026-01-01' };
  s.update('contacts', c.id, input); assert.equal(D.balance(s.data, c.id), 23500);
  assert.throws(() => s.update('contacts', c.id, { ...input, type: 'supplier' }), /türü/);
});
test('Eski sürüm dosyası yedeklenir; toplam fatura ve kasa hareketleri aynen kalır', t => {
  const s = setup(t);
  const legacy = { version: 1, contacts: [{ id: 'c', name: 'Eski cari', type: 'customer' }], accounts: [{ id: 'a', name: 'Kasa', type: 'cash' }], invoices: [{ id: 'i', number: 'ESKI-1', contactId: 'c', date: '2025-01-01', amount: 5000, type: 'sale' }], transactions: [{ id: 't', date: '2025-01-02', amount: 1000, type: 'income', accountId: 'a' }] };
  fs.mkdirSync(path.dirname(s.file), { recursive: true }); fs.writeFileSync(s.file, JSON.stringify(legacy));
  const migrated = new Store(s.file);
  assert.deepEqual(JSON.parse(fs.readFileSync(s.file + '.v1-backup')), legacy);
  assert.equal(migrated.data.version, 2); assert.deepEqual(migrated.data.invoices, legacy.invoices); assert.deepEqual(migrated.data.transactions, legacy.transactions); assert.equal(D.balance(migrated.data, 'c'), 5000);
  assert.equal(new Store(s.file).data.version, 2);
});
test('Önceki geçiş yedeği varsa üzerine yazılmaz', t => {
  const s = setup(t); fs.writeFileSync(s.file, JSON.stringify({ version: 1, contacts: [], accounts: [], invoices: [], transactions: [] }));
  fs.writeFileSync(s.file + '.v1-backup', 'korunacak'); new Store(s.file);
  assert.equal(fs.readFileSync(s.file + '.v1-backup', 'utf8'), 'korunacak');
});
test('Bozuk dosya sessizce sıfırlanmaz', t => {
  const s = setup(t); fs.writeFileSync(s.file, 'broken'); assert.throws(() => new Store(s.file)); assert.equal(fs.readFileSync(s.file, 'utf8'), 'broken');
});
test('Kapanmış faturanın tahsilatı düzenlenirken kendi tutarı iki kez sayılmaz', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s), i = invoice(s, c, p);
  const txn = payment(s, c, a, { amount: '240', invoiceId: i.id });
  const input = { description: 'Düzeltilmiş açıklama', date: txn.date, type: txn.type, amount: '240', contactId: c.id, invoiceId: i.id, accountId: a.id };
  s.update('transactions', txn.id, input); assert.equal(D.paid(s.data, i.id), 24000); assert.equal(D.balance(s.data, c.id), 0);
  assert.throws(() => s.update('transactions', txn.id, { ...input, amount: '241' }), /aşıyor/);
  assert.equal(s.data.transactions.length, 1);
});
test('Eski bağımsız tahsilat cariye ve faturaya bağlanırken kasa hareketi çoğalmaz', t => {
  const s = setup(t), c = contact(s), p = product(s), a = account(s), i = invoice(s, c, p);
  s.add('transactions', { description: 'Önceki tahsilat', date: '2026-10-18', amount: '100', type: 'income', accountId: a.id });
  const txn = s.data.transactions[0];
  s.update('transactions', txn.id, { ...txn, amount: '100', contactId: c.id, invoiceId: i.id });
  assert.equal(s.data.transactions.length, 1); assert.equal(s.data.transactions[0].amount, 10000); assert.equal(D.balance(s.data, c.id), 14000);
});
