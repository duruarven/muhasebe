const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const empty = () => ({ version: 1, contacts: [], accounts: [], transactions: [], invoices: [] });
function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) throw Error(`${name} gerekli (en fazla 300 karakter).`);
  return value.trim();
}
function money(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw Error('Tutarı en fazla iki ondalık basamakla girin.');
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Geçerli, sıfırdan büyük bir tutar girin.');
  return amount;
}
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error('Geçerli bir tarih girin.');
  return value;
}
class Store {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : empty();
    if (this.data.version !== 1 || ['contacts', 'accounts', 'transactions', 'invoices'].some(k => !Array.isArray(this.data[k]))) throw Error('Veri dosyası biçimi geçersiz. Dosyayı koruyup yedeğinizden yardım alın.');
  }
  save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.data = data;
  }
  add(kind, input) {
    const row = { id: randomUUID() };
    if (kind === 'contacts') {
      Object.assign(row, { name: text(input.name, 'Ad'), type: input.type });
      if (!['customer', 'supplier'].includes(row.type)) throw Error('Cari türü geçersiz.');
    } else if (kind === 'accounts') {
      Object.assign(row, { name: text(input.name, 'Hesap adı'), type: input.type });
      if (!['cash', 'bank'].includes(row.type)) throw Error('Hesap türü geçersiz.');
    } else if (kind === 'transactions' || kind === 'invoices') {
      Object.assign(row, { description: text(input.description, 'Açıklama'), date: date(input.date), amount: money(input.amount), type: input.type });
      if (kind === 'transactions') {
        if (!['income', 'expense'].includes(row.type)) throw Error('İşlem türü geçersiz.');
        if (!this.data.accounts.some(a => a.id === input.accountId)) throw Error('Bir kasa veya banka hesabı seçin.');
        row.accountId = input.accountId;
      } else {
        if (!['sale', 'purchase'].includes(row.type)) throw Error('Fatura türü geçersiz.');
        const contact = this.data.contacts.find(c => c.id === input.contactId);
        if (!contact || contact.type !== (row.type === 'sale' ? 'customer' : 'supplier')) throw Error('Fatura türüne uygun müşteri veya tedarikçi seçin.');
        row.contactId = input.contactId;
        row.number = text(input.number, 'Fatura numarası');
        if (this.data.invoices.some(i => i.number === row.number && i.contactId === row.contactId && i.type === row.type)) throw Error('Bu cari için fatura numarası zaten kayıtlı.');
      }
    } else throw Error('Kayıt türü geçersiz.');
    this.save({ ...this.data, [kind]: [...this.data[kind], row] });
    return this.data;
  }
  remove(kind, id) {
    if (!['contacts', 'accounts', 'transactions', 'invoices'].includes(kind)) throw Error('Kayıt türü geçersiz.');
    if (kind === 'contacts' && this.data.invoices.some(i => i.contactId === id)) throw Error('Önce bu cariye bağlı faturaları silin.');
    if (kind === 'accounts' && this.data.transactions.some(t => t.accountId === id)) throw Error('Önce bu hesaba bağlı işlemleri silin.');
    this.save({ ...this.data, [kind]: this.data[kind].filter(r => r.id !== id) });
    return this.data;
  }
}
module.exports = { Store, money };
