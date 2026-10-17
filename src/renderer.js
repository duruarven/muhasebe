'use strict';
const D = window.AccountingDomain;
let data, view = 'overview', contactId = null, tab = 'ledger', search = '';
const modal = document.querySelector('#modal');
const titles = { overview: 'Genel bakış', contacts: 'Cari hesaplar', products: 'Ürün & stok', invoices: 'Faturalar', transactions: 'Tahsilat & ödeme', accounts: 'Kasa & banka' };
const subtitles = { overview: 'İşletmenizin nakit akışını ve cari durumunu tek yerden izleyin.', contacts: 'Müşteri ve tedarikçilerinizi yönetin, hesap hareketlerine ulaşın.', products: 'Ürün kartları, alış-satış fiyatları ve güncel stok miktarları.', invoices: 'Ürünlü alış ve satış faturalarınızı takip edin.', transactions: 'Cari tahsilatları, ödemeler ve bağımsız kasa hareketleri.', accounts: 'Nakit ve banka hesaplarınızın güncel bakiyeleri.' };
const names = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'Müşteri & tedarikçi', cash: 'Nakit kasa', bank: 'Banka hesabı', income: 'Tahsilat / gelir', expense: 'Ödeme / gider', sale: 'Satış', purchase: 'Alış' };
const fmt = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n / 100);
const qty = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(n / 1000);
const raw = n => String((n || 0) / 100);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const day = v => v ? v.split('-').reverse().join('.') : '—';
const badge = (s, color = '') => `<span class="badge ${color}">${esc(s)}</span>`;
const button = (label, action, style = '', attrs = '') => `<button type="button" class="${style}" data-action="${action}" ${attrs}>${label}</button>`;
const input = (name, title, value = '', type = 'text', required = true, extra = '') => `<label>${title}${required ? ' <em>*</em>' : ''}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} maxlength="300" ${extra}></label>`;
function select(name, title, options, value = '', required = true) { return `<label>${title}${required ? ' <em>*</em>' : ''}<select name="${name}" ${required ? 'required' : ''}>${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`; }
function table(headers, rows, message = 'Henüz kayıt bulunmuyor.', guidance = 'Yeni kayıt ekleyerek başlayabilirsiniz.') { return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="empty"><strong>${message}</strong>${guidance}</div>`; }
function panel(title, body, action = '', subtitle = '') { return `<div class="panel"><div class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</div>${body}</div>`; }
const metric = (title, value, note, icon, highlight = false) => `<div class="metric ${highlight ? 'highlight' : ''}"><span class="metric-label">${title}</span><span class="metric-icon">${icon}</span><strong>${value}</strong><small>${note}</small></div>`;
function notice(message, error = false) { const el = document.querySelector('#notice'); el.textContent = message; el.className = error ? 'error' : ''; }
async function api(promise) { const r = await promise; if (!r.ok) throw Error(r.error); return r.data; }
function searchBox(placeholder) { return `<input id="search" type="search" class="search" aria-label="Kayıtlarda ara" placeholder="${placeholder}" value="${esc(search)}">`; }
const matches = r => Object.values(r).some(v => typeof v === 'string' && v.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
function debtLabel(n) { return n > 0 ? 'Alacağımız var' : n < 0 ? 'Borcumuz var' : 'Hesap kapalı'; }
function contactName(id) { return data.contacts.find(c => c.id === id)?.name || 'Bağımsız işlem'; }
function go(next, id = null) { view = next; contactId = id; tab = 'ledger'; search = ''; notice(''); render(); }
function render() {
  const contact = data.contacts.find(c => c.id === contactId);
  if (contactId && !contact) contactId = null;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelector('#eyebrow').textContent = contact ? 'CARİ HESAP YÖNETİMİ' : 'İŞLETMENİZİN FİNANSAL GÖRÜNÜMÜ';
  document.querySelector('#title').textContent = contact ? 'Cari hesap detayı' : titles[view];
  document.querySelector('#subtitle').textContent = contact ? 'Faturalar, tahsilatlar ve tüm hesap hareketleri.' : subtitles[view];
  const primaryActions = { overview: ['+ Cari aç', 'new-contact'], contacts: ['+ Yeni cari', 'new-contact'], products: ['+ Yeni ürün', 'new-product'], invoices: ['+ Yeni fatura', 'new-invoice'], transactions: ['+ Yeni hareket', 'new-transaction'], accounts: ['+ Yeni hesap', 'new-account'] };
  document.querySelector('#page-actions').innerHTML = contact ? button('← Cari listesi', 'back', 'secondary') : button(...primaryActions[view]);
  const cash = data.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const balances = data.contacts.map(c => D.balance(data, c.id));
  if (contact) {
    const ledger = D.ledger(data, contact.id), balance = D.balance(data, contact.id);
    document.querySelector('#summary').innerHTML = metric('Cari bakiyesi', fmt(Math.abs(balance)), debtLabel(balance), '◎', true) + metric('Borç hareketleri', fmt(ledger.reduce((s, r) => s + r.debit, 0)), 'Satış + ödeme + borç açılışı', '+') + metric('Alacak hareketleri', fmt(ledger.reduce((s, r) => s + r.credit, 0)), 'Alış + tahsilat + alacak açılışı', '−') + metric('Fatura sayısı', data.invoices.filter(i => i.contactId === contact.id).length, 'Bu cariye ait tüm faturalar', '▤');
  } else {
    document.querySelector('#summary').innerHTML = metric('Toplam kasa & banka', fmt(cash), `${data.accounts.length} aktif hesap`, '▣', true) + metric('Carilerden alacağımız', fmt(balances.filter(n => n > 0).reduce((s, n) => s + n, 0)), 'Net cari bakiyelerine göre', '+') + metric('Carilere borcumuz', fmt(-balances.filter(n => n < 0).reduce((s, n) => s + n, 0)), 'Net cari bakiyelerine göre', '−') + metric('Ürün çeşitleri', data.products.length, `${data.invoices.length} kayıtlı fatura`, '▦');
  }
  let html;
  if (contact) html = contactDetail(contact);
  else if (view === 'overview') html = overview();
  else if (view === 'contacts') html = panel('Cari hesap listesi', '<div id="list-body"></div>', searchBox('Cari unvanı, kod veya telefon ara…'));
  else if (view === 'products') html = panel('Ürün kartları', '<div id="list-body"></div>', searchBox('Ürün adı veya kodu ara…'), 'Stok = açılış + alış faturaları − satış faturaları');
  else if (view === 'invoices') html = panel('Tüm faturalar', '<div id="list-body"></div>', searchBox('Fatura numarası veya açıklama ara…'));
  else if (view === 'transactions') html = panel('Hesap hareketleri', '<div id="list-body"></div>', searchBox('Açıklama veya tarih ara…'));
  else html = accountList();
  document.querySelector('#content').innerHTML = html;
  renderList();
  document.querySelector('#search')?.addEventListener('input', e => { search = e.target.value; renderList(); });
}
function renderList() {
  const target = document.querySelector('#list-body');
  if (!target) return;
  if (view === 'contacts') target.innerHTML = contactTable(data.contacts.filter(matches));
  if (view === 'products') target.innerHTML = productTable(data.products.filter(matches));
  if (view === 'invoices') target.innerHTML = invoiceTable(data.invoices.filter(matches));
  if (view === 'transactions') target.innerHTML = transactionTable(data.transactions.filter(matches));
}
function contactTable(contacts) {
  return table(['CARİ KODU', 'CARİ UNVANI', 'TÜR', 'TELEFON', 'BAKİYE', 'DURUM', ''], contacts.map(c => {
    const balance = D.balance(data, c.id);
    return `<tr class="clickable" data-contact="${c.id}"><td>${esc(c.code || '—')}</td><td><button class="name-button" data-contact="${c.id}">${esc(c.name)}</button><small>${esc(c.taxNumber || 'Vergi numarası belirtilmedi')}</small></td><td>${badge(names[c.type])}</td><td>${esc(c.phone || '—')}</td><td class="num"><strong>${fmt(Math.abs(balance))}</strong></td><td>${badge(debtLabel(balance), balance > 0 ? 'green' : balance < 0 ? 'red' : '')}</td><td class="muted">→</td></tr>`;
  }), 'Cari hesabınız henüz yok.', 'Yeni cari açın; ardından adına tıklayarak fatura ve ödeme girebilirsiniz.');
}
function productTable(products) {
  return table(['ÜRÜN KODU', 'ÜRÜN ADI', 'ALIŞ FİYATI', 'SATIŞ FİYATI', 'KDV', 'STOK', ''], products.map(p => {
    const stock = D.stock(data, p.id);
    return `<tr><td>${esc(p.code)}</td><td><strong>${esc(p.name)}</strong><small>${esc(p.unit)}</small></td><td class="num">${fmt(p.purchasePrice)}</td><td class="num">${fmt(p.salePrice)}</td><td>%${p.vatBps / 100}</td><td class="num ${stock < 0 ? 'negative' : ''}">${qty(stock)} ${esc(p.unit)}</td><td><div class="actions">${button('Düzenle', 'edit-product', 'secondary small', `data-id="${p.id}"`)}${button('Sil', 'delete', 'danger small', `data-kind="products" data-id="${p.id}"`)}</div></td></tr>`;
  }), 'Ürün kartı bulunmuyor.', 'Ürün açıp alış ve satış faturalarında kullanın. Negatif stok kırmızı gösterilir.');
}
function invoiceTable(invoices) {
  return table(['FATURA', 'CARİ', 'TARİH / VADE', 'TÜR', 'TOPLAM', 'KALAN', 'DURUM', ''], invoices.slice().reverse().map(i => {
    const remaining = i.amount - D.paid(data, i.id);
    const overdue = remaining > 0 && i.dueDate && i.dueDate < today();
    return `<tr><td><button class="name-button" data-action="invoice-detail" data-id="${i.id}">${esc(i.number)}</button><small>${esc(i.description)}</small></td><td><button class="name-button" data-contact="${i.contactId}">${esc(contactName(i.contactId))}</button></td><td>${day(i.date)}<small>${day(i.dueDate)}</small></td><td>${badge(names[i.type], i.type === 'sale' ? 'green' : '')}</td><td class="num">${fmt(i.amount)}</td><td class="num">${fmt(remaining)}</td><td>${badge(remaining === 0 ? 'Kapandı' : overdue ? 'Vadesi geçti' : remaining < i.amount ? 'Kısmi ödeme' : 'Açık', remaining === 0 ? 'green' : overdue ? 'red' : 'amber')}</td><td>${button('Aç', 'invoice-detail', 'ghost small', `data-id="${i.id}"`)}</td></tr>`;
  }), 'Henüz fatura bulunmuyor.', 'Cari kartını açıp ürünlü alış veya satış faturası ekleyin.');
}
function transactionTable(transactions) {
  return table(['TARİH', 'AÇIKLAMA', 'CARİ / FATURA', 'HESAP', 'TÜR', 'TUTAR', ''], transactions.slice().reverse().map(t => `<tr><td>${day(t.date)}</td><td>${esc(t.description)}</td><td>${t.contactId ? `<button class="name-button" data-contact="${t.contactId}">${esc(contactName(t.contactId))}</button>` : '<span class="muted">Bağımsız işlem</span>'}<small>${esc(data.invoices.find(i => i.id === t.invoiceId)?.number || '')}</small></td><td>${esc(data.accounts.find(a => a.id === t.accountId)?.name)}</td><td>${badge(names[t.type], t.type === 'income' ? 'green' : 'red')}</td><td class="num ${t.type === 'income' ? 'positive' : 'negative'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</td><td><div class="actions">${button('Düzenle', 'edit-transaction', 'secondary small', `data-id="${t.id}"`)}${button('Sil', 'delete', 'danger small', `data-kind="transactions" data-id="${t.id}"`)}</div></td></tr>`), 'Hesap hareketi bulunmuyor.', 'Bir kasa/banka hesabı açıp tahsilat veya ödeme ekleyin.');
}
function accountList() {
  return panel('Kasa ve banka hesapları', table(['HESAP ADI', 'TÜR', 'BAKİYE', ''], data.accounts.map(a => {
    const balance = data.transactions.filter(t => t.accountId === a.id).reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    return `<tr><td><strong>${esc(a.name)}</strong></td><td>${badge(names[a.type])}</td><td class="num">${fmt(balance)}</td><td><div class="actions">${button('Düzenle', 'edit-account', 'secondary small', `data-id="${a.id}"`)}${button('Sil', 'delete', 'danger small', `data-kind="accounts" data-id="${a.id}"`)}</div></td></tr>`;
  }), 'Kasa veya banka hesabı bulunmuyor.', 'Tahsilat ve ödemeler için önce bir hesap açın.'));
}
function overview() {
  const overdue = data.invoices.filter(i => i.dueDate && i.dueDate < today() && D.paid(data, i.id) < i.amount);
  return `${!data.contacts.length ? '<div class="onboarding"><strong>İşletmenizi kurmaya başlayın.</strong> Önce kasa/banka hesabı ve cari kartı açın. Ardından ürünlerinizi ekleyip cari üzerinden fatura, tahsilat ve ödeme girin.</div>' : ''}<div class="split">${panel('Son faturalar', invoiceTable(data.invoices.slice(-5)), button('Tümünü gör →', 'all-invoices', 'secondary small'))}${panel('Hızlı işlemler', `<div class="quick-actions">${button('+ Cari hesap aç <small>Müşteri veya tedarikçi kartı oluşturun</small>', 'new-contact')}${button('▤ Ürünlü fatura oluştur <small>Miktar, birim fiyat, iskonto ve KDV</small>', 'new-invoice')}${button('⇄ Tahsilat / ödeme gir <small>Cari ve kasa bakiyesini birlikte güncelleyin</small>', 'new-transaction')}</div>`)}</div>${panel('Vadesi geçen faturalar', invoiceTable(overdue), badge(`${overdue.length} fatura`, overdue.length ? 'amber' : 'green'))}`;
}
function contactDetail(c) {
  const canSale = c.type !== 'supplier', canPurchase = c.type !== 'customer';
  let body;
  if (tab === 'ledger') {
    const rows = D.ledger(data, c.id);
    body = `<div class="panel-head"><div><h2>Hesap ekstresi</h2><p>Tarihe göre sıralı cari hareketleri</p></div>${button('Ekstre yazdır', 'print', 'secondary small')}</div><div class="toolbar-note">Borç sütunu cariye borç kaydını, alacak sütunu cariye alacak kaydını gösterir. Pozitif net bakiye işletmenizin alacağı, negatif net bakiye işletmenizin borcudur.</div>${table(['TARİH', 'İŞLEM / BELGE', 'BORÇ', 'ALACAK', 'BAKİYE', ''], rows.map(r => `<tr><td>${day(r.date)}</td><td>${esc(r.description)}</td><td class="num">${r.debit ? fmt(r.debit) : '—'}</td><td class="num">${r.credit ? fmt(r.credit) : '—'}</td><td class="num"><strong>${fmt(Math.abs(r.balance))}</strong><small>${debtLabel(r.balance)}</small></td><td>${r.kind === 'invoices' ? button('Faturayı aç', 'invoice-detail', 'ghost small', `data-id="${r.id}"`) : r.kind === 'transactions' ? button('Düzenle', 'edit-transaction', 'secondary small', `data-id="${r.id}"`) : badge('Devir')}</td></tr>`), 'Bu carinin henüz hareketi yok.', 'Üstteki düğmelerden fatura veya tahsilat/ödeme ekleyin.')}`;
  } else if (tab === 'invoices') body = `<div class="toolbar-note">Kalan tutar, bu faturaya bağlanan tahsilat/ödemelerden hesaplanır. Faturasız avanslar yalnızca cari net bakiyesine yansır.</div>${invoiceTable(data.invoices.filter(i => i.contactId === c.id))}`;
  else if (tab === 'payments') body = transactionTable(data.transactions.filter(t => t.contactId === c.id));
  else body = `<dl class="info-grid">${[['Cari kodu', c.code], ['Cari unvanı', c.name], ['Tür', names[c.type]], ['Vergi no / TCKN', c.taxNumber], ['Vergi dairesi', c.taxOffice], ['Telefon', c.phone], ['E-posta', c.email], ['Adres', c.address], ['Açılış bakiyesi', `${fmt(Math.abs(c.openingBalance || 0))} · ${debtLabel(c.openingBalance || 0)}`]].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}</dl><div class="panel-head">${button('Cari bilgilerini düzenle', 'edit-contact', 'secondary', `data-id="${c.id}"`)}${button('Cariyi sil', 'delete', 'danger small', `data-kind="contacts" data-id="${c.id}"`)}</div>`;
  return `<div class="panel"><div class="detail-top"><div class="contact-hero"><div class="avatar">${esc(c.name.slice(0, 1).toLocaleUpperCase('tr'))}</div><div><h2>${esc(c.name)}</h2><p>${esc(c.code || 'Kod belirtilmedi')} &nbsp; · &nbsp; ${names[c.type]} &nbsp; · &nbsp; ${esc(c.phone || 'Telefon belirtilmedi')}</p></div></div><div class="detail-actions">${button('+ Ürün kartı', 'new-product', 'secondary')}${canSale ? button('+ Satış faturası', 'sale-invoice') : ''}${canPurchase ? button('+ Alış faturası', 'purchase-invoice') : ''}${button('↓ Tahsilat al', 'receive', 'ghost')}${button('↑ Ödeme yap', 'pay', 'secondary')}</div></div><div class="tabs" role="tablist" aria-label="Cari detay bölümleri">${[['ledger', 'Hesap ekstresi'], ['invoices', 'Faturalar'], ['payments', 'Tahsilat & ödeme'], ['info', 'Cari bilgileri']].map(([v, label]) => `<button type="button" role="tab" aria-selected="${tab === v}" class="${tab === v ? 'active' : ''}" data-tab="${v}">${label}</button>`).join('')}</div><div class="detail-body" role="tabpanel">${body}</div></div>`;
}
function openModal(title, html, wide = false) {
  modal.classList.toggle('wide', wide);
  document.querySelector('#modal-title').textContent = title;
  document.querySelector('#modal-body').innerHTML = html;
  document.querySelector('#modal-error').textContent = '';
  if (!modal.open) modal.showModal();
}
function footer(label = 'Kaydet') { return `<div class="form-footer">${button('Vazgeç', 'close-modal', 'secondary')}<button type="submit">${label}</button></div>`; }
function bindForm(kind, id, collect) {
  const form = modal.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault(); const b = form.querySelector('[type="submit"]'); b.disabled = true;
    document.querySelector('#modal-error').textContent = '';
    try {
      const input = collect ? collect(form) : Object.fromEntries(new FormData(form));
      data = await api(id ? window.accounting.update(kind, id, input) : window.accounting.add(kind, input));
      modal.close(); notice(id ? 'Kayıt güncellendi.' : 'Kayıt başarıyla oluşturuldu.'); render();
    } catch (err) { document.querySelector('#modal-error').textContent = err.message; b.disabled = false; }
  });
}
function contactForm(id) {
  const c = data.contacts.find(c => c.id === id) || {};
  openModal(id ? 'Cari kartını düzenle' : 'Yeni cari hesap aç', `<form><div class="form-section">Cari bilgileri</div><div class="form-grid">${input('code', 'Cari kodu', c.code, 'text', false, 'placeholder="Örn. CR-001"')}${select('type', 'Cari türü', [['customer', 'Müşteri'], ['supplier', 'Tedarikçi'], ['both', 'Müşteri & tedarikçi']], c.type || 'customer')}${input('name', 'Cari unvanı / ad soyad', c.name)}${input('phone', 'Telefon', c.phone, 'tel', false)}${input('taxNumber', 'Vergi no / TCKN', c.taxNumber, 'text', false)}${input('taxOffice', 'Vergi dairesi', c.taxOffice, 'text', false)}${input('email', 'E-posta', c.email, 'email', false)}${input('address', 'Adres', c.address, 'text', false)}</div><div class="form-section">Açılış / devir bakiyesi</div><div class="form-grid three">${input('openingAmount', 'Tutar (₺)', raw(Math.abs(c.openingBalance || 0)), 'text', true, 'inputmode="decimal"')}${select('openingSide', 'Bakiye yönü', [['receivable', 'Bu cariden alacağımız var'], ['payable', 'Bu cariye borcumuz var']], c.openingBalance < 0 ? 'payable' : 'receivable')}${input('openingDate', 'Devir tarihi', c.openingDate || today(), 'date')}</div><p class="form-note">Devir bakiyesi yalnızca cari hesabı etkiler, kasa/banka hareketi oluşturmaz. Eski faturalarınız zaten kayıtlıysa aynı tutarı tekrar devir olarak eklemeyin.</p>${footer(id ? 'Değişiklikleri kaydet' : 'Cari hesabı oluştur')}</form>`);
  bindForm('contacts', id);
}
function productForm(id) {
  const p = data.products.find(p => p.id === id) || {};
  openModal(id ? 'Ürün kartını düzenle' : 'Yeni ürün kartı', `<form><div class="form-grid">${input('code', 'Ürün kodu', p.code, 'text', true, 'placeholder="Örn. UR-001"')}${input('name', 'Ürün adı', p.name)}${select('unit', 'Birim', [['Adet', 'Adet'], ['Kg', 'Kg'], ['Litre', 'Litre'], ['Metre', 'Metre'], ['Paket', 'Paket'], ['Koli', 'Koli'], ['Saat', 'Saat']], p.unit || 'Adet')}${input('vatRate', 'KDV oranı (%)', p.vatBps == null ? '20' : p.vatBps / 100, 'text', true, 'inputmode="decimal"')}${input('purchasePrice', 'KDV hariç alış fiyatı (₺)', raw(p.purchasePrice), 'text', true, 'inputmode="decimal"')}${input('salePrice', 'KDV hariç satış fiyatı (₺)', raw(p.salePrice), 'text', true, 'inputmode="decimal"')}${input('openingStock', 'Açılış stok miktarı', (p.openingStock || 0) / 1000, 'text', true, 'inputmode="decimal"')}</div><p class="form-note">Fatura girişleri stoğu otomatik günceller. Negatif stok girişine izin verilir ve listede kırmızı gösterilir. Kart fiyatları değişse de önceki faturaların fiyatları korunur.</p>${footer()}</form>`);
  bindForm('products', id);
}
function accountForm(id) {
  const a = data.accounts.find(a => a.id === id) || {};
  openModal(id ? 'Hesabı düzenle' : 'Yeni kasa / banka hesabı', `<form><div class="form-grid">${input('name', 'Hesap adı', a.name, 'text', true, 'placeholder="Örn. Ana kasa veya banka adı"')}${select('type', 'Hesap türü', [['cash', 'Nakit kasa'], ['bank', 'Banka hesabı']], a.type || 'cash')}</div><p class="form-note">Açılış nakit bakiyesi için bağımsız bir gelir/gider hareketi ekleyebilirsiniz. Bu işlem kasa giriş/çıkış toplamlarına da yansır.</p>${footer()}</form>`);
  bindForm('accounts', id);
}
function paymentForm(type = 'income', invoiceId = '', presetContact = contactId, editId = '') {
  const old = data.transactions.find(t => t.id === editId);
  if (!data.accounts.length) { notice('Tahsilat/ödeme için önce kasa veya banka hesabı açın.', true); accountForm(); return; }
  const inv = data.invoices.find(i => i.id === invoiceId);
  const cid = inv?.contactId || presetContact || '';
  openModal(old ? 'Tahsilat / ödeme düzenle' : type === 'income' ? 'Tahsilat / gelir kaydı' : 'Ödeme / gider kaydı', `<form><div class="form-grid">${select('contactId', 'Cari hesap', [['', 'Bağımsız işlem (cari seçme)'], ...data.contacts.map(c => [c.id, c.name])], cid, false)}${select('type', 'İşlem yönü', [['income', 'Tahsilat / gelir (kasaya giriş)'], ['expense', 'Ödeme / gider (kasadan çıkış)']], type)}${select('accountId', 'Kasa / banka', [['', 'Hesap seçin'], ...data.accounts.map(a => [a.id, a.name])], old?.accountId || '')}${input('amount', 'Tutar (₺)', old ? raw(old.amount) : inv ? raw(inv.amount - D.paid(data, inv.id)) : '', 'text', true, 'inputmode="decimal"')}${input('date', 'İşlem tarihi', old?.date || today(), 'date')}${input('description', 'Açıklama', old ? old.description : inv ? `${inv.number} ${type === 'income' ? 'tahsilatı' : 'ödemesi'}` : '')}${select('invoiceId', 'İlişkili fatura (isteğe bağlı)', [['', 'Faturasız / avans']], '', false)}</div><p class="form-note">Cari seçildiğinde hem cari hem kasa/banka bakiyesi güncellenir. Fatura seçildiğinde faturanın kalan tutarı da azalır. Faturasız kayıt avans veya genel cari ödemesi olarak izlenir.</p>${footer('Hareketi kaydet')}</form>`);
  const form = modal.querySelector('form');
  function refreshInvoices(selected = '') {
    const cid = form.elements.contactId.value, type = form.elements.type.value;
    const invoices = data.invoices.filter(i => i.contactId === cid && i.type === (type === 'income' ? 'sale' : 'purchase') && (D.paid(data, i.id) < i.amount || old?.invoiceId === i.id));
    form.elements.invoiceId.innerHTML = '<option value="">Faturasız / avans</option>' + invoices.map(i => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.number)} · kalan ${fmt(i.amount - D.paid(data, i.id) + (old?.invoiceId === i.id ? old.amount : 0))}</option>`).join('');
  }
  refreshInvoices(invoiceId);
  form.elements.contactId.addEventListener('change', () => refreshInvoices());
  form.elements.type.addEventListener('change', () => refreshInvoices());
  form.elements.invoiceId.addEventListener('change', () => {
    const i = data.invoices.find(i => i.id === form.elements.invoiceId.value);
    if (i) { form.elements.amount.value = raw(i.amount - D.paid(data, i.id) + (old?.invoiceId === i.id ? old.amount : 0)); form.elements.description.value = `${i.number} ${form.elements.type.value === 'income' ? 'tahsilatı' : 'ödemesi'}`; }
  });
  bindForm('transactions', editId);
}
function invoiceForm(type, presetContact = contactId) {
  if (!data.contacts.length) { notice('Fatura için önce bir cari hesap açın.', true); contactForm(); return; }
  if (!data.products.length) { notice('Ürünlü fatura için önce bir ürün kartı açın.', true); productForm(); return; }
  const c = data.contacts.find(c => c.id === presetContact);
  type = type || (c?.type === 'supplier' || (!c && !data.contacts.some(c => c.type !== 'supplier')) ? 'purchase' : 'sale');
  const prefix = type === 'sale' ? 'SAT' : 'ALI';
  let n = data.invoices.length + 1;
  while (data.invoices.some(i => i.number === `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`)) n++;
  openModal(type === 'sale' ? 'Yeni satış faturası' : 'Yeni alış faturası', `<form><div class="form-grid three">${select('contactId', 'Cari hesap', [['', 'Cari seçin'], ...data.contacts.filter(c => c.type === 'both' || c.type === (type === 'sale' ? 'customer' : 'supplier')).map(c => [c.id, c.name])], presetContact || '')}${input('number', 'Fatura numarası', `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`)}${select('type', 'Fatura türü', [['sale', 'Satış faturası'], ['purchase', 'Alış faturası']], type)}${input('date', 'Fatura tarihi', today(), 'date')}${input('dueDate', 'Vade tarihi', today(), 'date')}${input('description', 'Açıklama', type === 'sale' ? 'Ürün satışı' : 'Ürün alışı')}</div><div class="form-section">Fatura kalemleri <span class="muted">· Fiyatlar KDV hariçtir</span></div><div class="table-wrap"><table class="line-items"><thead><tr><th class="product-col">ÜRÜN</th><th class="qty-col">MİKTAR</th><th class="price-col">BİRİM FİYAT ₺</th><th class="rate-col">İSK. %</th><th class="rate-col">KDV %</th><th class="total-col">TOPLAM</th><th></th></tr></thead><tbody id="invoice-lines"></tbody></table></div><div class="line-tools">${button('+ Ürün satırı ekle', 'add-line', 'ghost small')}<span class="muted">En fazla 100 satır · miktar 3 ondalık</span></div><div id="invoice-totals" class="totals" aria-live="polite"></div><p class="form-note">Kaydedildiğinde cari bakiye ve stok güncellenir. Tahsilat/ödeme için ayrıca hareket girin. Bu kayıt resmi e-Fatura/e-Arşiv belgesi değildir.</p>${footer('Faturayı kaydet')}</form>`, true);
  const form = modal.querySelector('form');
  form.elements.type.addEventListener('change', () => {
    const previous = form.elements.contactId.value;
    form.elements.contactId.innerHTML = '<option value="">Cari seçin</option>' + data.contacts.filter(c => c.type === 'both' || c.type === (form.elements.type.value === 'sale' ? 'customer' : 'supplier')).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if ([...form.elements.contactId.options].some(o => o.value === previous)) form.elements.contactId.value = previous;
    modal.querySelectorAll('.invoice-line').forEach(row => setProduct(row));
  });
  addInvoiceLine();
  bindForm('invoices', null, form => ({ ...Object.fromEntries(new FormData(form)), items: [...modal.querySelectorAll('.invoice-line')].map(readLine) }));
}
function readLine(row) { return Object.fromEntries([...row.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el.value])); }
function setProduct(row) {
  const p = data.products.find(p => p.id === row.querySelector('[data-field="productId"]').value);
  if (p) { row.querySelector('[data-field="unitPrice"]').value = raw(modal.querySelector('[name="type"]').value === 'sale' ? p.salePrice : p.purchasePrice); row.querySelector('[data-field="vatRate"]').value = p.vatBps / 100; }
  updateInvoiceTotals();
}
function addInvoiceLine() {
  const body = modal.querySelector('#invoice-lines');
  if (!body || body.children.length >= 100) return;
  const tr = document.createElement('tr'); tr.className = 'invoice-line';
  tr.innerHTML = `<td><select data-field="productId" aria-label="Satır ürünü" required><option value="">Ürün seçin</option>${data.products.map(p => `<option value="${p.id}">${esc(p.code)} · ${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></td><td><input data-field="quantity" aria-label="Miktar" value="1" inputmode="decimal" required maxlength="20"></td><td><input data-field="unitPrice" aria-label="Birim fiyat" value="0" inputmode="decimal" required maxlength="20"></td><td><input data-field="discount" aria-label="İskonto oranı" value="0" inputmode="decimal" required maxlength="6"></td><td><input data-field="vatRate" aria-label="KDV oranı" value="20" inputmode="decimal" required maxlength="6"></td><td class="line-total num">—</td><td>${button('×', 'remove-line', 'icon-button', 'aria-label="Satırı kaldır"')}</td>`;
  body.append(tr);
  tr.querySelector('select').addEventListener('change', () => setProduct(tr));
  tr.addEventListener('input', updateInvoiceTotals);
  updateInvoiceTotals();
}
function updateInvoiceTotals() {
  let subtotal = 0, tax = 0, discount = 0, total = 0, invalid = false;
  for (const row of modal.querySelectorAll('.invoice-line')) {
    try { const l = D.line(readLine(row)); subtotal = D.safe(subtotal + l.subtotal); tax = D.safe(tax + l.vatAmount); discount = D.safe(discount + l.discountAmount); total = D.safe(total + l.amount); row.querySelector('.line-total').textContent = fmt(l.amount); }
    catch { invalid = true; row.querySelector('.line-total').textContent = 'Geçersiz'; }
  }
  modal.querySelector('#invoice-totals').innerHTML = `<div class="total-row"><span>İskonto toplamı</span><strong>${fmt(discount)}</strong></div><div class="total-row"><span>Ara toplam (net)</span><strong>${fmt(subtotal)}</strong></div><div class="total-row"><span>KDV toplamı</span><strong>${fmt(tax)}</strong></div><div class="total-row final"><span>Genel toplam</span><strong>${invalid ? '—' : fmt(total)}</strong></div>`;
}
function invoiceDetail(id) {
  const i = data.invoices.find(i => i.id === id); if (!i) return;
  const paid = D.paid(data, i.id), remaining = i.amount - paid;
  openModal(`${names[i.type]} faturası · ${i.number}`, `<div class="invoice-info"><div><strong>${esc(contactName(i.contactId))}</strong>${esc(i.description)}<br><small>Fatura: ${day(i.date)} · Vade: ${day(i.dueDate)}<br>${esc(i.number)}</small></div><div><small>GENEL TOPLAM</small><div class="invoice-total">${fmt(i.amount)}</div>${badge(remaining === 0 ? 'Kapandı' : 'Açık hesap', remaining === 0 ? 'green' : 'amber')}</div></div>${i.items ? table(['ÜRÜN', 'MİKTAR', 'BİRİM FİYAT', 'İSK. %', 'KDV %', 'TOPLAM'], i.items.map(l => `<tr><td>${esc(l.name)}<small>${esc(l.code)}</small></td><td>${qty(l.quantityMilli)} ${esc(l.unit)}</td><td>${fmt(l.unitPrice)}</td><td>%${l.discountBps / 100}</td><td>%${l.vatBps / 100}</td><td class="num">${fmt(l.amount)}</td></tr>`)) : '<p class="form-note">Önceki sürümden aktarılan toplam tutarlı faturadır; ürün detayı ve stok hareketi içermez.</p>'}<div class="totals">${i.subtotal != null ? `<div class="total-row"><span>Ara toplam</span><strong>${fmt(i.subtotal)}</strong></div><div class="total-row"><span>KDV</span><strong>${fmt(i.vatAmount)}</strong></div>` : ''}<div class="total-row"><span>Bağlı tahsilat / ödeme</span><strong>${fmt(paid)}</strong></div><div class="total-row final"><span>Kalan tutar</span><strong>${fmt(remaining)}</strong></div></div><p class="form-note">Faturasız avanslar bu faturanın kalanına otomatik dağıtılmaz; cari bakiyesinde görünür. Bu belge resmi mali belge değildir.</p><div class="form-footer">${button('Sil', 'delete', 'danger', `data-kind="invoices" data-id="${i.id}"`)}${button('Yazdır', 'print', 'secondary')}${remaining > 0 ? button(i.type === 'sale' ? 'Tahsilat al' : 'Ödeme yap', 'invoice-payment', '', `data-id="${i.id}"`) : ''}</div>`, true);
}
async function action(name, el) {
  const id = el?.dataset.id;
  if (name === 'back') return go('contacts');
  if (name === 'all-invoices') return go('invoices');
  if (name === 'new-contact' || name === 'edit-contact') return contactForm(id);
  if (name === 'new-product' || name === 'edit-product') return productForm(id);
  if (name === 'new-account' || name === 'edit-account') return accountForm(id);
  if (name === 'new-invoice') return invoiceForm();
  if (name === 'sale-invoice') return invoiceForm('sale');
  if (name === 'purchase-invoice') return invoiceForm('purchase');
  if (name === 'new-transaction' || name === 'receive') return paymentForm('income');
  if (name === 'pay') return paymentForm('expense');
  if (name === 'edit-transaction') { const t = data.transactions.find(t => t.id === id); return paymentForm(t.type, t.invoiceId || '', t.contactId || '', t.id); }
  if (name === 'invoice-detail') return invoiceDetail(id);
  if (name === 'close-modal') return modal.close();
  if (name === 'add-line') return addInvoiceLine();
  if (name === 'remove-line') {
    if (modal.querySelectorAll('.invoice-line').length > 1) { el.closest('tr').remove(); updateInvoiceTotals(); }
    return;
  }
  if (name === 'invoice-payment') { const i = data.invoices.find(i => i.id === id); return paymentForm(i.type === 'sale' ? 'income' : 'expense', id, i.contactId); }
  if (name === 'print') { try { await api(window.accounting.print()); } catch (e) { notice(e.message, true); } return; }
  if (name === 'delete') {
    const kind = el.dataset.kind;
    if (!confirm('Bu kayıt silinsin mi? İlgili cari, stok ve kasa bakiyeleri yeniden hesaplanacak.')) return;
    el.disabled = true;
    try { data = await api(window.accounting.remove(kind, id)); if (modal.open) modal.close(); notice('Kayıt silindi, bakiyeler güncellendi.'); render(); }
    catch (e) { if (modal.open) document.querySelector('#modal-error').textContent = e.message; else notice(e.message, true); el.disabled = false; }
  }
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
document.addEventListener('click', e => {
  const contact = e.target.closest('[data-contact]');
  if (contact) return go('contacts', contact.dataset.contact);
  const tabButton = e.target.closest('[data-tab]');
  if (tabButton) { tab = tabButton.dataset.tab; render(); return; }
  const el = e.target.closest('[data-action]');
  if (el) Promise.resolve(action(el.dataset.action, el)).catch(err => notice(err.message, true));
});
document.querySelector('#modal-close').addEventListener('click', () => modal.close());
document.querySelector('#backup').addEventListener('click', async () => { try { const r = await api(window.accounting.backup()); if (r) notice(r); } catch (e) { notice(e.message, true); } });
document.querySelector('#today').textContent = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date());
(async () => { try { data = await api(window.accounting.read()); render(); } catch (e) { notice(e.message, true); } })();
