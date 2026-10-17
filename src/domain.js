(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AccountingDomain = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX = 9_000_000_000_000;
  function safe(n) {
    if (!Number.isSafeInteger(n) || Math.abs(n) > MAX) throw Error('Tutar veya miktar işlem sınırını aşıyor.');
    return n;
  }
  function decimal(value, places, name, allowZero = false) {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!(new RegExp(`^\\d+(\\.\\d{1,${places}})?$`)).test(s)) throw Error(`${name}: en fazla ${places} ondalık basamak kullanın.`);
    const [whole, fraction = ''] = s.split('.');
    const n = safe(Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0')));
    if (n < 0 || (!allowZero && n === 0)) throw Error(`${name} sıfırdan büyük olmalı.`);
    return n;
  }
  const money = (v, allowZero = false) => decimal(v, 2, 'Tutar', allowZero);
  const quantity = (v, allowZero = false) => decimal(v, 3, 'Miktar', allowZero);
  function rate(v) {
    const n = decimal(v, 2, 'Oran', true);
    if (n > 10000) throw Error('Oran %0 ile %100 arasında olmalı.');
    return n;
  }
  const rounded = (a, b, divisor) => safe(Number((BigInt(a) * BigInt(b) + BigInt(divisor / 2)) / BigInt(divisor)));
  function line(input) {
    const quantityMilli = quantity(input.quantity), unitPrice = money(input.unitPrice, true);
    const vatBps = rate(input.vatRate ?? '20'), discountBps = rate(input.discount ?? '0');
    const gross = rounded(quantityMilli, unitPrice, 1000);
    const discountAmount = rounded(gross, discountBps, 10000);
    const subtotal = gross - discountAmount;
    const vatAmount = rounded(subtotal, vatBps, 10000);
    return { quantityMilli, unitPrice, vatBps, discountBps, discountAmount, subtotal, vatAmount, amount: safe(subtotal + vatAmount) };
  }
  const paid = (data, invoiceId) => data.transactions.filter(t => t.invoiceId === invoiceId).reduce((s, t) => safe(s + t.amount), 0);
  function ledger(data, contactId) {
    const c = data.contacts.find(c => c.id === contactId);
    if (!c) return [];
    const rows = [];
    if (c.openingBalance) rows.push({ id: 'opening', kind: 'opening', date: c.openingDate, description: 'Açılış bakiyesi', debit: Math.max(0, c.openingBalance), credit: Math.max(0, -c.openingBalance), order: '' });
    data.invoices.filter(i => i.contactId === contactId).forEach(i => rows.push({ id: i.id, kind: 'invoices', date: i.date, description: `${i.type === 'sale' ? 'Satış' : 'Alış'} faturası · ${i.number}`, debit: i.type === 'sale' ? i.amount : 0, credit: i.type === 'purchase' ? i.amount : 0, order: i.createdAt || '' }));
    data.transactions.filter(t => t.contactId === contactId).forEach(t => rows.push({ id: t.id, kind: 'transactions', date: t.date, description: `${t.type === 'income' ? 'Tahsilat' : 'Ödeme'} · ${t.description}`, debit: t.type === 'expense' ? t.amount : 0, credit: t.type === 'income' ? t.amount : 0, order: t.createdAt || '' }));
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order) || a.id.localeCompare(b.id));
    let balance = 0;
    return rows.map(r => ({ ...r, balance: balance = safe(balance + r.debit - r.credit) }));
  }
  const balance = (data, contactId) => ledger(data, contactId).at(-1)?.balance || 0;
  function stock(data, productId) {
    let n = data.products.find(p => p.id === productId)?.openingStock || 0;
    for (const i of data.invoices) for (const item of i.items || []) if (item.productId === productId) n = safe(n + (i.type === 'purchase' ? item.quantityMilli : -item.quantityMilli));
    return n;
  }
  return { safe, money, quantity, rate, line, paid, ledger, balance, stock };
});
