"use strict";
const D = window.AccountingDomain;
let data,
  view = "overview",
  contactId = null,
  lastContactId = null,
  tab = "ledger",
  search = "";
let ledgerFilters = { sort: "date", desc: true },
  selectedLedger = null;
const expandedLedger = new Set();
const modal = document.querySelector("#modal");
const titles = {
  overview: "Genel bakış",
  contacts: "Cari hesaplar",
  products: "Ürün & stok",
  invoices: "Faturalar",
  transactions: "Tahsilat & ödeme",
  accounts: "Kasa & banka",
  reports: "Cari bakiye raporu",
};
const subtitles = {
  overview: "İşletmenizin nakit akışını ve cari durumunu tek yerden izleyin.",
  contacts: "Müşteri ve tedarikçilerinizi yönetin, hesap hareketlerine ulaşın.",
  products: "Ürün kartları, alış-satış fiyatları ve güncel stok miktarları.",
  invoices: "Ürünlü alış ve satış faturalarınızı takip edin.",
  transactions: "Cari tahsilatları, ödemeler ve bağımsız kasa hareketleri.",
  accounts: "Nakit ve banka hesaplarınızın güncel bakiyeleri.",
  reports: "Cari hesapların borç, alacak ve net bakiye dökümü.",
};
const names = {
  customer: "Müşteri",
  supplier: "Tedarikçi",
  both: "Müşteri & tedarikçi",
  cash: "Nakit kasa",
  bank: "Banka hesabı",
  income: "Tahsilat / gelir",
  expense: "Ödeme / gider",
  sale: "Satış",
  purchase: "Alış",
};
const fmt = (n) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    n / 100,
  );
const qty = (n) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(n / 1000);
const raw = (n) => String((n || 0) / 100);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const day = (v) => (v ? v.split("-").reverse().join(".") : "—");
const badge = (s, color = "") =>
  `<span class="badge ${color}">${esc(s)}</span>`;
const button = (label, action, style = "", attrs = "") =>
  `<button type="button" class="${style}" data-action="${action}" ${attrs}>${label}</button>`;
const input = (
  name,
  title,
  value = "",
  type = "text",
  required = true,
  extra = "",
) =>
  `<label>${title}${required ? " <em>*</em>" : ""}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="300" ${extra}></label>`;
function select(name, title, options, value = "", required = true) {
  return `<label>${title}${required ? " <em>*</em>" : ""}<select name="${name}" ${required ? "required" : ""}>${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
}
function table(
  headers,
  rows,
  message = "Henüz kayıt bulunmuyor.",
  guidance = "Yeni kayıt ekleyerek başlayabilirsiniz.",
) {
  return rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : `<div class="empty"><strong>${message}</strong>${guidance}</div>`;
}
function panel(title, body, action = "", subtitle = "") {
  return `<div class="panel"><div class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${action}</div>${body}</div>`;
}
const metric = (title, value, note, icon, highlight = false) =>
  `<div class="metric ${highlight ? "highlight" : ""}"><span class="metric-label">${title}</span><span class="metric-icon">${icon}</span><strong>${value}</strong><small>${note}</small></div>`;
function notice(message, error = false) {
  const el = document.querySelector("#notice");
  el.textContent = message;
  el.className = error ? "error" : "";
}
async function api(promise) {
  const r = await promise;
  if (!r.ok) throw Error(r.error);
  return r.data;
}
function searchBox(placeholder) {
  return `<input id="search" type="search" class="search" aria-label="Kayıtlarda ara" placeholder="${placeholder}" value="${esc(search)}">`;
}
const matches = (r) =>
  Object.values(r).some(
    (v) =>
      typeof v === "string" &&
      v.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
  );
function debtLabel(n) {
  return n > 0 ? "Alacağımız var" : n < 0 ? "Borcumuz var" : "Hesap kapalı";
}
function contactName(id) {
  return data.contacts.find((c) => c.id === id)?.name || "Bağımsız işlem";
}
function go(next, id = null) {
  if (modal.open) modal.close();
  if (id !== contactId) {
    ledgerFilters = { sort: "date", desc: true };
    selectedLedger = null;
    expandedLedger.clear();
  }
  view = next;
  contactId = id;
  if (id) lastContactId = id;
  tab = "ledger";
  search = "";
  notice("");
  render();
}
function render() {
  const contact = data.contacts.find((c) => c.id === contactId);
  if (contactId && !contact) contactId = null;
  document.body.classList.toggle("contact-open", Boolean(contact));
  document.title = contact
    ? `${contact.name} — İşletmem Muhasebe`
    : "İşletmem Muhasebe";
  renderAppMenus();
  document.querySelector("#workspace-tabs").innerHTML =
    contact || view === "contacts"
      ? `${button("CARİ KART TANIMLARI", "card-definitions", !contact ? "active" : "")}${button("CARİ KART HAREKETLERİ", "card-movements", contact ? "active" : "")}<span class="workspace-title">${contact ? esc(contact.code || "") + (contact.code ? ": " : "") + esc(contact.name.toLocaleUpperCase("tr")) : "CARİ HESAPLAR"}</span>${contact ? button("KAPAT", "back", "close-workspace") : ""}`
      : `${button(titles[view].toLocaleUpperCase("tr"), "refresh", "active")}<span class="workspace-title">İŞLETMEM</span>`;
  document.querySelector("#status-location").textContent = contact
    ? `Cari: ${contact.code || ""} ${contact.name}`
    : titles[view];
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelector("#eyebrow").textContent = contact
    ? "CARİ HESAP YÖNETİMİ"
    : "İŞLETMENİZİN FİNANSAL GÖRÜNÜMÜ";
  document.querySelector("#title").textContent = contact
    ? "Cari hesap detayı"
    : titles[view];
  document.querySelector("#subtitle").textContent = contact
    ? "Faturalar, tahsilatlar ve tüm hesap hareketleri."
    : subtitles[view];
  const primaryActions = {
    overview: ["+ Cari aç", "new-contact"],
    contacts: ["+ Yeni cari", "new-contact"],
    products: ["+ Yeni ürün", "new-product"],
    invoices: ["+ Yeni fatura", "new-invoice"],
    transactions: ["+ Yeni hareket", "new-transaction"],
    accounts: ["+ Yeni hesap", "new-account"],
    reports: ["Yazdır", "print"],
  };
  document.querySelector("#page-actions").innerHTML = contact
    ? button("← Cari listesi", "back", "secondary")
    : button(...primaryActions[view]);
  const cash = data.transactions.reduce(
    (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
    0,
  );
  const balances = data.contacts.map((c) => D.balance(data, c.id));
  if (contact) {
    document.querySelector("#summary").innerHTML = contactSummary(contact);
  } else {
    document.querySelector("#summary").innerHTML =
      metric(
        "Toplam kasa & banka",
        fmt(cash),
        `${data.accounts.length} aktif hesap`,
        "▣",
        true,
      ) +
      metric(
        "Carilerden alacağımız",
        fmt(balances.filter((n) => n > 0).reduce((s, n) => s + n, 0)),
        "Net cari bakiyelerine göre",
        "+",
      ) +
      metric(
        "Carilere borcumuz",
        fmt(-balances.filter((n) => n < 0).reduce((s, n) => s + n, 0)),
        "Net cari bakiyelerine göre",
        "−",
      ) +
      metric(
        "Ürün çeşitleri",
        data.products.length,
        `${data.invoices.length} kayıtlı fatura`,
        "▦",
      );
  }
  let html;
  if (contact) html = contactDetail(contact);
  else if (view === "overview") html = overview();
  else if (view === "contacts")
    html = panel(
      "Cari hesap listesi",
      '<div id="list-body"></div>',
      searchBox("Cari unvanı, kod veya telefon ara…"),
    );
  else if (view === "products")
    html = panel(
      "Ürün kartları",
      '<div id="list-body"></div>',
      searchBox("Ürün adı veya kodu ara…"),
      "Stok = açılış + alış faturaları − satış faturaları",
    );
  else if (view === "invoices")
    html = panel(
      "Tüm faturalar",
      '<div id="list-body"></div>',
      searchBox("Fatura numarası veya açıklama ara…"),
    );
  else if (view === "transactions")
    html = panel(
      "Hesap hareketleri",
      '<div id="list-body"></div>',
      searchBox("Açıklama veya tarih ara…"),
    );
  else if (view === "reports") html = reports();
  else html = accountList();
  document.querySelector("#content").innerHTML = html;
  renderList();
  document.querySelector("#search")?.addEventListener("input", (e) => {
    search = e.target.value;
    renderList();
  });
}
function renderList() {
  const target = document.querySelector("#list-body");
  if (!target) return;
  if (view === "contacts")
    target.innerHTML = contactTable(data.contacts.filter(matches));
  if (view === "products")
    target.innerHTML = productTable(data.products.filter(matches));
  if (view === "invoices")
    target.innerHTML = invoiceTable(data.invoices.filter(matches));
  if (view === "transactions")
    target.innerHTML = transactionTable(data.transactions.filter(matches));
}
function contactTable(contacts) {
  return table(
    ["CARİ KODU", "CARİ UNVANI", "TÜR", "TELEFON", "BAKİYE", "DURUM", ""],
    contacts.map((c) => {
      const balance = D.balance(data, c.id);
      return `<tr class="clickable" data-contact="${c.id}"><td>${esc(c.code || "—")}</td><td><button class="name-button" data-contact="${c.id}">${esc(c.name)}</button><small>${esc(c.taxNumber || "Vergi numarası belirtilmedi")}</small></td><td>${badge(names[c.type])}</td><td>${esc(c.phone || "—")}</td><td class="num"><strong>${fmt(Math.abs(balance))}</strong></td><td>${badge(debtLabel(balance), balance > 0 ? "green" : balance < 0 ? "red" : "")}</td><td class="muted">→</td></tr>`;
    }),
    "Cari hesabınız henüz yok.",
    "Yeni cari açın; ardından adına tıklayarak fatura ve ödeme girebilirsiniz.",
  );
}
function productTable(products) {
  return table(
    ["ÜRÜN KODU", "ÜRÜN ADI", "ALIŞ FİYATI", "SATIŞ FİYATI", "KDV", "STOK", ""],
    products.map((p) => {
      const stock = D.stock(data, p.id);
      return `<tr><td>${esc(p.code)}</td><td><strong>${esc(p.name)}</strong><small>${esc(p.unit)}</small></td><td class="num">${fmt(p.purchasePrice)}</td><td class="num">${fmt(p.salePrice)}</td><td>%${p.vatBps / 100}</td><td class="num ${stock < 0 ? "negative" : ""}">${qty(stock)} ${esc(p.unit)}</td><td><div class="actions">${button("Düzenle", "edit-product", "secondary small", `data-id="${p.id}"`)}${button("Sil", "delete", "danger small", `data-kind="products" data-id="${p.id}"`)}</div></td></tr>`;
    }),
    "Ürün kartı bulunmuyor.",
    "Ürün açıp alış ve satış faturalarında kullanın. Negatif stok kırmızı gösterilir.",
  );
}
function invoiceTable(invoices) {
  return table(
    ["FATURA", "CARİ", "TARİH / VADE", "TÜR", "TOPLAM", "KALAN", "DURUM", ""],
    invoices
      .slice()
      .reverse()
      .map((i) => {
        const remaining = i.amount - D.paid(data, i.id);
        const overdue = remaining > 0 && i.dueDate && i.dueDate < today();
        return `<tr><td><button class="name-button" data-action="invoice-detail" data-id="${i.id}">${esc(i.number)}</button><small>${esc(i.description)}</small></td><td><button class="name-button" data-contact="${i.contactId}">${esc(contactName(i.contactId))}</button></td><td>${day(i.date)}<small>${day(i.dueDate)}</small></td><td>${badge(names[i.type], i.type === "sale" ? "green" : "")}</td><td class="num">${fmt(i.amount)}</td><td class="num">${fmt(remaining)}</td><td>${badge(remaining === 0 ? "Kapandı" : overdue ? "Vadesi geçti" : remaining < i.amount ? "Kısmi ödeme" : "Açık", remaining === 0 ? "green" : overdue ? "red" : "amber")}</td><td>${button("Aç", "invoice-detail", "ghost small", `data-id="${i.id}"`)}</td></tr>`;
      }),
    "Henüz fatura bulunmuyor.",
    "Cari kartını açıp ürünlü alış veya satış faturası ekleyin.",
  );
}
function transactionTable(transactions) {
  return table(
    ["TARİH", "AÇIKLAMA", "CARİ / FATURA", "HESAP", "TÜR", "TUTAR", ""],
    transactions
      .slice()
      .reverse()
      .map(
        (t) =>
          `<tr><td>${day(t.date)}</td><td>${esc(t.description)}</td><td>${t.contactId ? `<button class="name-button" data-contact="${t.contactId}">${esc(contactName(t.contactId))}</button>` : '<span class="muted">Bağımsız işlem</span>'}<small>${esc(data.invoices.find((i) => i.id === t.invoiceId)?.number || "")}</small></td><td>${esc(data.accounts.find((a) => a.id === t.accountId)?.name)}</td><td>${badge(names[t.type], t.type === "income" ? "green" : "red")}</td><td class="num ${t.type === "income" ? "positive" : "negative"}">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</td><td><div class="actions">${button("Düzenle", "edit-transaction", "secondary small", `data-id="${t.id}"`)}${button("Sil", "delete", "danger small", `data-kind="transactions" data-id="${t.id}"`)}</div></td></tr>`,
      ),
    "Hesap hareketi bulunmuyor.",
    "Bir kasa/banka hesabı açıp tahsilat veya ödeme ekleyin.",
  );
}
function accountList() {
  return panel(
    "Kasa ve banka hesapları",
    table(
      ["HESAP ADI", "TÜR", "BAKİYE", ""],
      data.accounts.map((a) => {
        const balance = data.transactions
          .filter((t) => t.accountId === a.id)
          .reduce(
            (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
            0,
          );
        return `<tr><td><strong>${esc(a.name)}</strong></td><td>${badge(names[a.type])}</td><td class="num">${fmt(balance)}</td><td><div class="actions">${button("Düzenle", "edit-account", "secondary small", `data-id="${a.id}"`)}${button("Sil", "delete", "danger small", `data-kind="accounts" data-id="${a.id}"`)}</div></td></tr>`;
      }),
      "Kasa veya banka hesabı bulunmuyor.",
      "Tahsilat ve ödemeler için önce bir hesap açın.",
    ),
  );
}
function overview() {
  const overdue = data.invoices.filter(
    (i) => i.dueDate && i.dueDate < today() && D.paid(data, i.id) < i.amount,
  );
  return `${!data.contacts.length ? '<div class="onboarding"><strong>İşletmenizi kurmaya başlayın.</strong> Önce kasa/banka hesabı ve cari kartı açın. Ardından ürünlerinizi ekleyip cari üzerinden fatura, tahsilat ve ödeme girin.</div>' : ""}<div class="split">${panel("Son faturalar", invoiceTable(data.invoices.slice(-5)), button("Tümünü gör →", "all-invoices", "secondary small"))}${panel("Hızlı işlemler", `<div class="quick-actions">${button("+ Cari hesap aç <small>Müşteri veya tedarikçi kartı oluşturun</small>", "new-contact")}${button("▤ Ürünlü fatura oluştur <small>Miktar, birim fiyat, iskonto ve KDV</small>", "new-invoice")}${button("⇄ Tahsilat / ödeme gir <small>Cari ve kasa bakiyesini birlikte güncelleyin</small>", "new-transaction")}</div>`)}</div>${panel("Vadesi geçen faturalar", invoiceTable(overdue), badge(`${overdue.length} fatura`, overdue.length ? "amber" : "green"))}`;
}
function dropdown(label, key, items, cls = "") {
  return `<div class="drop-host"><button type="button" class="drop-toggle ${cls}" data-menu="${key}" aria-haspopup="menu" aria-expanded="false">${label}<span class="menu-arrow" aria-hidden="true">▼</span></button><div class="drop-menu" role="menu" data-menu-panel="${key}" hidden>${items.map((item) => (item === null ? '<hr role="separator">' : `<button type="button" role="menuitem" data-action="${item[1]}"><span class="menu-item-icon" aria-hidden="true">⊞</span>${item[0]}</button>`)).join("")}</div></div>`;
}
const transactionMenu = () => [
  ["Yeni Tahsilat", "receive"],
  ["Yeni Ödeme", "pay"],
  null,
  ["Mal Satışı / Satış Faturası", "sale-invoice"],
  ["Stoksuz Satış / Hizmet Faturası", "stockless-sale"],
  null,
  ["Mal Alışı / Alış Faturası", "purchase-invoice"],
  ["Stoksuz Alış / Gider Faturası", "stockless-purchase"],
  null,
  ["Ürün Kartı Aç", "new-product"],
];
function renderAppMenus() {
  document.querySelector("#app-menus").innerHTML =
    dropdown("Dosya", "file", [
      ["Verileri yedekle", "backup"],
      ["Listeyi yenile", "refresh"],
    ]) +
    dropdown("Tanımlar", "definitions", [
      ["Yeni cari kart", "new-contact"],
      ["Yeni stok kartı", "new-product"],
      ["Yeni kasa / banka", "new-account"],
    ]) +
    dropdown("İşlemler", "operations", transactionMenu()) +
    dropdown("Raporlar", "reports", [
      ["Cari bakiye raporu", "all-reports"],
      ...(contactId
        ? [
            ["Bu carinin analizi", "analysis"],
            ["Bu carinin ekstresini CSV kaydet", "export-ledger"],
          ]
        : []),
    ]) +
    dropdown("Yardım", "help", [["Kullanım ve klavye kısayolları", "help"]]);
}
const numberFormat = (n) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100);
function contactSummary(c) {
  const rows = D.ledger(data, c.id),
    balance = D.balance(data, c.id);
  const debit =
    rows.reduce((n, r) => n + r.debit, 0) - Math.max(0, c.openingBalance || 0);
  const credit =
    rows.reduce((n, r) => n + r.credit, 0) -
    Math.max(0, -(c.openingBalance || 0));
  return `<div class="contact-summary"><div class="balance-card"><div class="balance-caption"><span>${esc(c.code || "CARİ")}: ${esc(c.name.toLocaleUpperCase("tr"))}</span><small>CARİ HESAP</small></div><div class="balance-row"><label>Toplam Bakiye</label><div class="balance-value">${numberFormat(Math.abs(balance))}</div><div class="currency-box">TL</div></div><div class="balance-row">${button("Kart Seçimi", "back", "small")}<div class="balance-state">HESAP DURUMU: ${balance > 0 ? "CARİ BORÇLU" : balance < 0 ? "CARİ ALACAKLI" : "HESAP KAPALI"}</div></div></div><div class="balance-matrix"><table aria-label="Cari bakiye özeti"><thead><tr><th>Bakiyeler</th><th class="num">TL</th></tr></thead><tbody>${[
    ["DEVİR", c.openingBalance || 0],
    ["Borç", debit],
    ["Alacak", credit],
    ["BAKİYE", balance],
  ]
    .map(
      ([title, value]) =>
        `<tr><td>${title}</td><td class="num">${numberFormat(value)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><div class="contact-quick"><strong>${names[c.type]} · ${esc(c.phone || "Telefon belirtilmedi")}</strong><br>${debtLabel(balance)}${c.taxNumber ? " · VKN/TCKN: " + esc(c.taxNumber) : ""}<div class="actions">${button("+ Ürün kartı", "new-product")}${button("+ Satış faturası", "sale-invoice")}${button("+ Alış faturası", "purchase-invoice")}${button("↓ Tahsilat al", "receive")}${button("↑ Ödeme yap", "pay")}</div></div></div>`;
}
function contactDetail(c) {
  let body;
  if (tab === "ledger") body = ledgerGrid(c);
  else if (tab === "invoices")
    body = `<div class="toolbar-note">Kalan tutar, faturaya bağlı tahsilat/ödemelerden hesaplanır. Faturasız avanslar cari net bakiyesinde izlenir.</div>${invoiceTable(data.invoices.filter((i) => i.contactId === c.id))}`;
  else if (tab === "payments")
    body = transactionTable(
      data.transactions.filter((t) => t.contactId === c.id),
    );
  else
    body = `<dl class="info-grid">${[
      ["Cari kodu", c.code],
      ["Cari unvanı", c.name],
      ["Tür", names[c.type]],
      ["Vergi no / TCKN", c.taxNumber],
      ["Vergi dairesi", c.taxOffice],
      ["Telefon", c.phone],
      ["E-posta", c.email],
      ["Adres", c.address],
      [
        "Açılış bakiyesi",
        `${fmt(Math.abs(c.openingBalance || 0))} · ${debtLabel(c.openingBalance || 0)}`,
      ],
    ]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || "—")}</dd></div>`)
      .join(
        "",
      )}</dl><div class="panel-head">${button("Cari bilgilerini düzenle", "edit-contact", "", `data-id="${c.id}"`)}${button("Cariyi sil", "delete", "danger small", `data-kind="contacts" data-id="${c.id}"`)}</div>`;
  return `<div class="panel contact-panel"><div class="print-heading">${esc(c.name)} — Hesap Ekstresi<small>Rapor tarihi: ${day(today())} · Para birimi: TL · ${debtLabel(D.balance(data, c.id))}: ${fmt(Math.abs(D.balance(data, c.id)))}</small></div><div class="tabs" role="tablist" aria-label="Cari detay bölümleri">${[
    ["ledger", "Hesap ekstresi"],
    ["invoices", "Faturalar"],
    ["payments", "Tahsilat & ödeme"],
    ["info", "Cari bilgileri"],
  ]
    .map(
      ([v, label]) =>
        `<button type="button" role="tab" aria-selected="${tab === v}" class="${tab === v ? "active" : ""}" data-tab="${v}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div class="detail-body" role="tabpanel">${body}</div></div>`;
}
function currentLedgerRows() {
  return D.filterLedger(D.ledger(data, contactId), ledgerFilters);
}
function ledgerGrid(c) {
  const rows = currentLedgerRows();
  if (!rows.some((r) => r.id === selectedLedger))
    selectedLedger = rows[0]?.id || null;
  const filterLabels = [
    ledgerFilters.from ? `Başlangıç: ${day(ledgerFilters.from)}` : "",
    ledgerFilters.to ? `Bitiş: ${day(ledgerFilters.to)}` : "",
    ledgerFilters.operation
      ? `İşlem: ${{ sale: "Satış", purchase: "Alış", income: "Tahsilat", expense: "Ödeme", opening: "Devir" }[ledgerFilters.operation]}`
      : "",
    ledgerFilters.query ? `Aranan: ${esc(ledgerFilters.query)}` : "",
  ].filter(Boolean);
  const sort = (label, key) =>
    `<button type="button" data-action="sort-ledger" data-sort="${key}" title="${label} sütununa göre sırala">${label}${ledgerFilters.sort === key ? (ledgerFilters.desc ? " ▾" : " ▴") : ""}</button>`;
  return `<div class="ledger-toolbar"><span class="tool-icon">▤</span> Hesap Ekstresi <span class="toolbar-separator"></span>${dropdown('<span class="tool-icon red" aria-hidden="true">⊞</span>Yeni Cari İşlem', "new-cari", transactionMenu())}<span class="toolbar-separator"></span>${button('<span class="tool-icon green" aria-hidden="true">⚑</span>Süzgeç', "filter-ledger")}${button('<span class="tool-icon" aria-hidden="true">▥</span>Analiz', "analysis")}${dropdown(
    '<span class="tool-icon" aria-hidden="true">▤</span>Raporlar',
    "ledger-reports",
    [
      ["Ekstreyi CSV / Excel kaydet", "export-ledger"],
      ["Hesap ekstresi yazdır", "print"],
      ["Cari bakiye raporu", "all-reports"],
    ],
  )}<span class="toolbar-separator"></span>${button('<span class="tool-icon" aria-hidden="true">▣</span>Cari Bakiye Kontrolü', "balance-check")}${button("İşlemi aç", "open-selected")}${button("Sil", "delete-selected", "danger")}${button("Yazdır", "print")}</div><div class="filter-indicator">${filterLabels.length ? `<span>SÜZGEÇ: ${filterLabels.join(" · ")} — Ekstre bakiyesi tüm hareketlere göre hesaplanır.</span>${button("Süzgeci kaldır", "clear-filter", "small")}` : ""}</div><div class="grid-scroll"><table class="ledger-grid" role="grid" aria-label="Cari hesap hareketleri"><colgroup><col width="23"><col width="85"><col width="65"><col width="125"><col width="100"><col width="110"><col width="65"><col width="105"><col width="86"><col width="240"><col width="105"><col width="95"><col width="100"><col width="100"><col width="120"></colgroup><thead><tr><th></th><th>${sort("Tarih", "date")}</th><th>${sort("İşlem No", "entryNo")}</th><th>${sort("İşlem Türü", "type")}</th><th>Fiş No</th><th>Fatura No</th><th>Cari Türü</th><th>${sort("Cari Tutarı TL", "amount")}</th><th>${sort("Vade Tarihi", "dueDate")}</th><th>Açıklama</th><th>Kasa / Banka</th><th>İrsaliye No</th><th>Belge No</th><th>İşlem Grubu</th><th class="num">Bakiye TL (+/−)</th></tr></thead><tbody>${rows.map((r) => `<tr tabindex="0" data-ledger-row="${r.id}" aria-selected="${r.id === selectedLedger}" class="${r.id === selectedLedger ? "selected" : ""}" title="Çift tıklayarak işlemi açın"><td class="expand-cell">${r.kind === "invoices" ? button(expandedLedger.has(r.id) ? "−" : "+", "expand-ledger", "expand-button", `data-id="${r.id}" aria-label="Fatura satırlarını ${expandedLedger.has(r.id) ? "kapat" : "aç"}" aria-expanded="${expandedLedger.has(r.id)}"`) : ""}</td><td>${day(r.date)}</td><td class="num">${r.entryNo || "—"}</td><td>${esc(r.type)}</td><td>${esc(r.receiptNo)}</td><td>${esc(r.invoiceNo)}</td><td>${r.direction}</td><td class="num">${numberFormat(r.amount)}</td><td>${day(r.dueDate)}</td><td title="${esc(r.description)}">${esc(r.description)}</td><td>${esc(data.accounts.find((a) => a.id === r.accountId)?.name || "")}</td><td>${esc(r.deliveryNo)}</td><td>${esc(r.documentNo)}</td><td>${esc(r.group)}</td><td class="num">${numberFormat(r.balance)}</td></tr>${expandedLedger.has(r.id) && r.kind === "invoices" ? `<tr class="detail-row"><td colspan="15">${expandedInvoice(r.id)}</td></tr>` : ""}`).join("")}</tbody></table>${!rows.length ? '<div class="empty"><strong>Görüntülenecek hareket yok.</strong>Yeni Cari İşlem menüsünden kayıt ekleyin veya süzgeci değiştirin.</div>' : ""}</div><div class="grid-bottom"><div class="grid-navigator">${[
    ["│◁", "first", "İlk kayıt"],
    ["◁", "previous", "Önceki kayıt"],
    ["▷", "next", "Sonraki kayıt"],
    ["▷│", "last", "Son kayıt"],
  ]
    .map(([label, step, title]) =>
      button(
        label,
        "move-selection",
        "",
        `data-step="${step}" title="${title}" aria-label="${title}"`,
      ),
    )
    .join(
      "",
    )}${button("↻", "refresh", "", 'aria-label="Listeyi yenile"')}</div><span id="record-position">${rows.length ? rows.findIndex((r) => r.id === selectedLedger) + 1 : 0} / ${rows.length} kayıt</span><span class="grid-totals">Görüntülenen Borç: <strong>${numberFormat(rows.reduce((n, r) => n + r.debit, 0))}</strong> &nbsp; Alacak: <strong>${numberFormat(rows.reduce((n, r) => n + r.credit, 0))}</strong> &nbsp; TL</span></div>`;
}
function expandedInvoice(id) {
  const i = data.invoices.find((i) => i.id === id);
  return `${invoiceLineTable(i)}<p>Bağlı tahsilat / ödeme: <strong>${fmt(D.paid(data, id))}</strong> &nbsp; Kalan: <strong>${fmt(i.amount - D.paid(data, id))}</strong> ${button("Faturayı aç", "invoice-detail", "small", `data-id="${id}"`)}</p>`;
}
function selectLedger(id, focus = false) {
  const rows = currentLedgerRows(),
    row = rows.find((r) => r.id === id);
  if (!row) return;
  selectedLedger = id;
  document.querySelectorAll("[data-ledger-row]").forEach((el) => {
    const selected = el.dataset.ledgerRow === id;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-selected", String(selected));
    if (selected && focus) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  });
  const position = document.querySelector("#record-position");
  if (position)
    position.textContent = `${rows.findIndex((r) => r.id === id) + 1} / ${rows.length} kayıt`;
}
function openLedgerRecord() {
  const row = D.ledger(data, contactId).find((r) => r.id === selectedLedger);
  if (!row) return;
  if (row.kind === "invoices") return invoiceDetail(row.id);
  if (row.kind === "transactions") {
    const t = data.transactions.find((t) => t.id === row.id);
    return paymentForm(t.type, t.invoiceId || "", t.contactId, t.id);
  }
  return contactForm(contactId);
}
function filterForm() {
  openModal(
    "Hesap ekstresi süzgeci",
    `<form><div class="form-grid">${input("from", "Başlangıç tarihi", ledgerFilters.from || "", "date", false)}${input("to", "Bitiş tarihi", ledgerFilters.to || "", "date", false)}${select(
      "operation",
      "İşlem türü",
      [
        ["", "Tüm işlemler"],
        ["sale", "Satış faturaları"],
        ["purchase", "Alış faturaları"],
        ["income", "Tahsilatlar"],
        ["expense", "Ödemeler"],
        ["opening", "Devir bakiyesi"],
      ],
      ledgerFilters.operation || "",
      false,
    )}${input("query", "Fiş, fatura, açıklama veya grup ara", ledgerFilters.query || "", "text", false)}</div><p class="form-note">Süzgeç kayıtları değiştirmez. Satır bakiyeleri ve üstteki toplam bakiye tüm hareketlere göre hesaplanır.</p>${footer("Süzgeci uygula")}</form>`,
  );
  modal.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target));
    if (values.from && values.to && values.from > values.to) {
      document.querySelector("#modal-error").textContent =
        "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
      return;
    }
    ledgerFilters = { ...ledgerFilters, ...values };
    selectedLedger = null;
    modal.close();
    render();
  });
}
function transactionPicker() {
  if (!contactId) {
    contactPicker();
    return;
  }
  const c = data.contacts.find((c) => c.id === contactId);
  openModal(
    "Yeni Cari İşlem — " + c.name,
    `<p class="form-note">İşlem türünü seçin. Oluşturulan kayıt bu cariye işlenecektir.</p><div class="transaction-picker">${[
      [
        "Yeni Tahsilat",
        "receive",
        "Kasaya / bankaya giriş; carinin borcunu azaltır.",
        "cash",
      ],
      [
        "Yeni Ödeme",
        "pay",
        "Kasadan / bankadan çıkış; cariye borcumuzu azaltır.",
        "cash",
      ],
      [
        "Mal Satışı / Satış Faturası",
        "sale-invoice",
        "Ürün seçimi, stok çıkışı, KDV ve cari alacağı.",
        "invoice",
      ],
      [
        "Stoksuz Satış / Hizmet Faturası",
        "stockless-sale",
        "Ürün kartı olmadan tutar ve KDV ile satış.",
        "entries",
      ],
      [
        "Mal Alışı / Alış Faturası",
        "purchase-invoice",
        "Ürün seçimi, stok girişi, KDV ve cari borcu.",
        "stock",
      ],
      [
        "Stoksuz Alış / Gider Faturası",
        "stockless-purchase",
        "Stok hareketi oluşturmadan alış kaydı.",
        "entries",
      ],
    ]
      .map(([title, action, detail, icon]) =>
        button(
          `<img src="icons/${icon}.svg" alt=""><span><strong>${title}</strong><small>${detail}</small></span>`,
          action,
        ),
      )
      .join("")}</div>`,
  );
}
function contactPicker() {
  openModal(
    "Cari Kart Seçimi",
    `<p class="form-note">Hareketlerini açmak istediğiniz cariyi seçin.</p>${contactTable(data.contacts)}`,
  );
}
function balanceCheck() {
  if (!contactId) return contactPicker();
  const c = data.contacts.find((c) => c.id === contactId),
    check = D.auditContact(data, c.id);
  openModal(
    "Cari Bakiye Kontrolü — " + c.name,
    `<p class="${check.issues.length ? "danger-text" : "success-text"}"><strong>${check.issues.length ? "Kontrol edilmesi gereken kayıtlar var." : "Kontrol tamamlandı: hareket bağlantıları ve bakiye tutarlı."}</strong></p>${table(
      ["KONTROL", "SONUÇ"],
      [
        ["Hareket sayısı", check.count],
        ["Toplam borç", fmt(check.debit)],
        ["Toplam alacak", fmt(check.credit)],
        [
          "Net bakiye",
          `${fmt(Math.abs(check.balance))} · ${debtLabel(check.balance)}`,
        ],
      ].map(
        ([label, value]) => `<tr><td>${label}</td><td>${esc(value)}</td></tr>`,
      ),
    )}${check.issues.length ? `<ul>${check.issues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>` : '<p class="form-note">Bu kontrol ekstre toplamını, fatura satır toplamlarını ve cari/fatura/kasa bağlantılarını inceler. Resmi muhasebe denetimi değildir.</p>'}${footerButton()}`,
  );
}
function footerButton() {
  return `<div class="form-footer">${button("Kapat", "close-modal")}</div>`;
}
function analysis() {
  if (!contactId) return go("reports");
  const c = data.contacts.find((c) => c.id === contactId),
    monthly = new Map();
  for (const r of D.ledger(data, c.id)) {
    const month = r.date.slice(0, 7);
    if (!monthly.has(month))
      monthly.set(month, {
        sale: 0,
        purchase: 0,
        income: 0,
        expense: 0,
        opening: 0,
      });
    monthly.get(month)[r.operation] +=
      r.operation === "opening" ? r.debit - r.credit : r.amount;
  }
  openModal(
    "Cari Hesap Analizi — " + c.name,
    `<p class="form-note">Tüm hareketlerden hesaplanır. Fatura toplamları KDV dahil; tahsilat ve ödemeler nakit hareketidir.</p>${table(
      ["DÖNEM", "DEVİR", "SATIŞ", "ALIŞ", "TAHSİLAT", "ÖDEME"],
      [...monthly.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(
          ([month, amounts]) =>
            `<tr><td>${month}</td>${["opening", "sale", "purchase", "income", "expense"].map((key) => `<td class="num">${fmt(amounts[key])}</td>`).join("")}</tr>`,
        ),
    )}${footerButton()}`,
    true,
  );
}
function reports() {
  const rows = data.contacts.map((c) => ({
    c,
    audit: D.auditContact(data, c.id),
  }));
  return panel(
    "Cari Bakiye Raporu · TL",
    table(
      [
        "CARİ KODU",
        "CARİ UNVANI",
        "BORÇ TOPLAMI",
        "ALACAK TOPLAMI",
        "İŞLETMENİN ALACAĞI",
        "İŞLETMENİN BORCU",
      ],
      rows.map(
        ({ c, audit }) =>
          `<tr><td>${esc(c.code)}</td><td><button class="name-button" data-contact="${c.id}">${esc(c.name)}</button></td><td class="num">${fmt(audit.debit)}</td><td class="num">${fmt(audit.credit)}</td><td class="num">${fmt(Math.max(0, audit.balance))}</td><td class="num">${fmt(Math.max(0, -audit.balance))}</td></tr>`,
      ),
    ),
    button("Yazdır", "print"),
  );
}
function openModal(title, html, wide = false) {
  modal.classList.remove("sales-window");
  modal.classList.toggle("wide", wide);
  document.querySelector("#modal-title").textContent = title;
  document.querySelector("#modal-body").innerHTML = html;
  document.querySelector("#modal-error").textContent = "";
  if (!modal.open) modal.showModal();
}
function footer(label = "Kaydet") {
  return `<div class="form-footer">${button("Vazgeç", "close-modal", "secondary")}<button type="submit">${label}</button></div>`;
}
function bindForm(kind, id, collect) {
  const form = modal.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = form.querySelector('[type="submit"]');
    b.disabled = true;
    document.querySelector("#modal-error").textContent = "";
    try {
      const input = collect
        ? collect(form)
        : Object.fromEntries(new FormData(form));
      data = await api(
        id
          ? window.accounting.update(kind, id, input)
          : window.accounting.add(kind, input),
      );
      modal.close();
      notice(id ? "Kayıt güncellendi." : "Kayıt başarıyla oluşturuldu.");
      render();
    } catch (err) {
      document.querySelector("#modal-error").textContent = err.message;
      b.disabled = false;
    }
  });
}
function contactForm(id) {
  const c = data.contacts.find((c) => c.id === id) || {};
  openModal(
    id ? "Cari kartını düzenle" : "Yeni cari hesap aç",
    `<form><div class="form-section">Cari bilgileri</div><div class="form-grid">${input("code", "Cari kodu", c.code, "text", false, 'placeholder="Örn. CR-001"')}${select(
      "type",
      "Cari türü",
      [
        ["customer", "Müşteri"],
        ["supplier", "Tedarikçi"],
        ["both", "Müşteri & tedarikçi"],
      ],
      c.type || "customer",
    )}${input("name", "Cari unvanı / ad soyad", c.name)}${input("phone", "Telefon", c.phone, "tel", false)}${input("taxNumber", "Vergi no / TCKN", c.taxNumber, "text", false)}${input("taxOffice", "Vergi dairesi", c.taxOffice, "text", false)}${input("email", "E-posta", c.email, "email", false)}${input("address", "Adres", c.address, "text", false)}${input("discount", "Varsayılan cari iskonto (%)", (c.discountBps || 0) / 100, "text", true, 'inputmode="decimal"')}</div><div class="form-section">Açılış / devir bakiyesi</div><div class="form-grid three">${input("openingAmount", "Tutar (₺)", raw(Math.abs(c.openingBalance || 0)), "text", true, 'inputmode="decimal"')}${select(
      "openingSide",
      "Bakiye yönü",
      [
        ["receivable", "Bu cariden alacağımız var"],
        ["payable", "Bu cariye borcumuz var"],
      ],
      c.openingBalance < 0 ? "payable" : "receivable",
    )}${input("openingDate", "Devir tarihi", c.openingDate || today(), "date")}</div><p class="form-note">Devir bakiyesi yalnızca cari hesabı etkiler, kasa/banka hareketi oluşturmaz. Eski faturalarınız zaten kayıtlıysa aynı tutarı tekrar devir olarak eklemeyin.</p>${footer(id ? "Değişiklikleri kaydet" : "Cari hesabı oluştur")}</form>`,
  );
  bindForm("contacts", id);
}
function productForm(id) {
  const p = data.products.find((p) => p.id === id) || {};
  openModal(
    id ? "Ürün kartını düzenle" : "Yeni ürün kartı",
    `<form><div class="form-grid">${input("code", "Ürün kodu", p.code, "text", true, 'placeholder="Örn. UR-001"')}${input("name", "Ürün adı", p.name)}${input("barcode", "Barkod", p.barcode, "text", false)}${input("specialCode", "Özel kod", p.specialCode, "text", false)}${select(
      "unit",
      "Birim",
      [
        ["Adet", "Adet"],
        ["Kg", "Kg"],
        ["Litre", "Litre"],
        ["Metre", "Metre"],
        ["Paket", "Paket"],
        ["Koli", "Koli"],
        ["Saat", "Saat"],
      ],
      p.unit || "Adet",
    )}${input("vatRate", "KDV oranı (%)", p.vatBps == null ? "20" : p.vatBps / 100, "text", true, 'inputmode="decimal"')}${input("purchasePrice", "KDV hariç alış fiyatı (₺)", raw(p.purchasePrice), "text", true, 'inputmode="decimal"')}${input("salePrice", "KDV hariç satış fiyatı (₺)", raw(p.salePrice), "text", true, 'inputmode="decimal"')}${input("openingStock", "Açılış stok miktarı", (p.openingStock || 0) / 1000, "text", true, 'inputmode="decimal"')}</div><p class="form-note">Fatura girişleri stoğu otomatik günceller. Negatif stok girişine izin verilir ve listede kırmızı gösterilir. Kart fiyatları değişse de önceki faturaların fiyatları korunur.</p>${footer()}</form>`,
  );
  bindForm("products", id);
}
function accountForm(id) {
  const a = data.accounts.find((a) => a.id === id) || {};
  openModal(
    id ? "Hesabı düzenle" : "Yeni kasa / banka hesabı",
    `<form><div class="form-grid">${input("name", "Hesap adı", a.name, "text", true, 'placeholder="Örn. Ana kasa veya banka adı"')}${select(
      "type",
      "Hesap türü",
      [
        ["cash", "Nakit kasa"],
        ["bank", "Banka hesabı"],
      ],
      a.type || "cash",
    )}</div><p class="form-note">Açılış nakit bakiyesi için bağımsız bir gelir/gider hareketi ekleyebilirsiniz. Bu işlem kasa giriş/çıkış toplamlarına da yansır.</p>${footer()}</form>`,
  );
  bindForm("accounts", id);
}
function paymentForm(
  type = "income",
  invoiceId = "",
  presetContact = contactId,
  editId = "",
) {
  const old = data.transactions.find((t) => t.id === editId);
  if (!data.accounts.length) {
    notice("Tahsilat/ödeme için önce kasa veya banka hesabı açın.", true);
    accountForm();
    return;
  }
  const inv = data.invoices.find((i) => i.id === invoiceId);
  const cid = inv?.contactId || presetContact || "";
  openModal(
    old
      ? "Tahsilat / ödeme düzenle"
      : type === "income"
        ? "Tahsilat / gelir kaydı"
        : "Ödeme / gider kaydı",
    `<form><div class="form-grid">${select("contactId", "Cari hesap", [["", "Bağımsız işlem (cari seçme)"], ...data.contacts.map((c) => [c.id, c.name])], cid, false)}${select(
      "type",
      "İşlem yönü",
      [
        ["income", "Tahsilat / gelir (kasaya giriş)"],
        ["expense", "Ödeme / gider (kasadan çıkış)"],
      ],
      type,
    )}${select("accountId", "Kasa / banka", [["", "Hesap seçin"], ...data.accounts.map((a) => [a.id, a.name])], old?.accountId || "")}${input("amount", "Tutar (₺)", old ? raw(old.amount) : inv ? raw(inv.amount - D.paid(data, inv.id)) : "", "text", true, 'inputmode="decimal"')}${input("date", "İşlem tarihi", old?.date || today(), "date")}${input("description", "Açıklama", old ? old.description : inv ? `${inv.number} ${type === "income" ? "tahsilatı" : "ödemesi"}` : "")}${select("invoiceId", "İlişkili fatura (isteğe bağlı)", [["", "Faturasız / avans"]], "", false)}${input("receiptNo", "Fiş numarası (boşsa otomatik)", old?.receiptNo || "", "text", false)}${input("documentNo", "Belge numarası", old?.documentNo || "", "text", false)}${input("group", "İşlem grubu", old?.group || "", "text", false)}${input("deliveryNo", "İrsaliye numarası", old?.deliveryNo || "", "text", false)}</div><p class="form-note">Cari seçildiğinde hem cari hem kasa/banka bakiyesi güncellenir. Fatura seçildiğinde faturanın kalan tutarı da azalır. Faturasız kayıt avans veya genel cari ödemesi olarak izlenir.</p>${footer("Hareketi kaydet")}</form>`,
  );
  const form = modal.querySelector("form");
  function refreshInvoices(selected = "") {
    const cid = form.elements.contactId.value,
      type = form.elements.type.value;
    const invoices = data.invoices.filter(
      (i) =>
        i.contactId === cid &&
        i.type === (type === "income" ? "sale" : "purchase") &&
        (D.paid(data, i.id) < i.amount || old?.invoiceId === i.id),
    );
    form.elements.invoiceId.innerHTML =
      '<option value="">Faturasız / avans</option>' +
      invoices
        .map(
          (i) =>
            `<option value="${i.id}" ${i.id === selected ? "selected" : ""}>${esc(i.number)} · kalan ${fmt(i.amount - D.paid(data, i.id) + (old?.invoiceId === i.id ? old.amount : 0))}</option>`,
        )
        .join("");
  }
  refreshInvoices(invoiceId);
  form.elements.contactId.addEventListener("change", () => refreshInvoices());
  form.elements.type.addEventListener("change", () => refreshInvoices());
  form.elements.invoiceId.addEventListener("change", () => {
    const i = data.invoices.find((i) => i.id === form.elements.invoiceId.value);
    if (i) {
      form.elements.amount.value = raw(
        i.amount -
          D.paid(data, i.id) +
          (old?.invoiceId === i.id ? old.amount : 0),
      );
      form.elements.description.value = `${i.number} ${form.elements.type.value === "income" ? "tahsilatı" : "ödemesi"}`;
    }
  });
  bindForm("transactions", editId);
}
function openSales(type, stockless, presetContact = contactId) {
  if (!data.contacts.length) {
    notice("Önce bir cari hesap açın.", true);
    contactForm();
    return;
  }
  if (!stockless && !data.products.length) {
    notice("Stoklu fatura için önce ürün kartı açın.", true);
    productForm();
    return;
  }
  const c = data.contacts.find((c) => c.id === presetContact);
  type = type || (c?.type === "supplier" ? "purchase" : "sale");
  window.SalesEditor.open({
    data,
    type,
    stockless,
    contactId: presetContact,
    openDialog: openModal,
    api,
    onSaved: (next) => {
      data = next;
      render();
      notice(
        "Fatura kaydedildi. Cari, stok ve varsa peşin kasa hareketi güncellendi.",
      );
    },
  });
}
function invoiceForm(type, presetContact = contactId) {
  return openSales(type, false, presetContact);
}
function stocklessForm(type = "sale") {
  return openSales(type, true, contactId);
}
function help() {
  openModal(
    "Kullanım ve Klavye Kısayolları",
    `<h3 class="subtle-title">Cari işlem akışı</h3><ol class="help-list"><li>Cari modülünden bir kart açın veya listeden cari seçin.</li><li>Yeni Cari İşlem menüsünden tahsilat, ödeme, mal satışı, mal alışı veya stoksuz fatura seçin.</li><li>Mal satışında stok azalır, mal alışında artar. Stoksuz işlemler yalnızca cari hesabı etkiler.</li><li>Tahsilat/ödemede kasa veya banka hesabı seçin. Fatura seçerseniz faturanın kalan tutarı da güncellenir.</li><li>Satırdaki + düğmesi fatura kalemlerini açar. Çift tıklama işlemin detayını açar.</li><li>Süzgeç tarih / tür / açıklama ile kayıtları daraltır; üst bakiye tüm hareketleri kapsar.</li></ol><h3 class="subtle-title">Kısayollar</h3>${table(
      ["TUŞ", "İŞLEM"],
      [
        ["F4", "Yeni Cari İşlem"],
        ["F2 / Enter", "Seçili işlemi aç"],
        ["Ctrl + F", "Cari ekstre süzgeci / liste araması"],
        ["Ctrl + P", "Yazdır"],
        ["Yukarı / Aşağı", "Ekstrede kayıt seç"],
        ["Esc", "Menü veya pencereyi kapat"],
      ].map(([key, desc]) => `<tr><td>${key}</td><td>${desc}</td></tr>`),
    )}<p class="form-note">Dövizli satış/alış satırları elle girilen kurlarla TL'ye çevrilir. Cari ve kasa bakiyeleri TL'dir. Resmi e-Fatura/e-Arşiv gönderimi, çek/senet ve taksit planı modülleri bulunmaz. Cari türü gruplama içindir; aynı cariye alış ve satış kaydedilebilir.</p>${footerButton()}`,
  );
}
function hideMenus() {
  document.querySelectorAll("[data-menu-panel]").forEach((p) => {
    p.hidden = true;
  });
  document
    .querySelectorAll("[data-menu]")
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function invoiceLineTable(i) {
  const lines = D.invoiceLines(i);
  return lines.length
    ? table(
        [
          "KOD",
          "ÜRÜN / HİZMET",
          "MİKTAR",
          "BİRİM FİYAT",
          "KUR",
          "KDV",
          "DAHİL?",
          "CARİ İSK.",
          "İSK. 1 / 2 / 3",
          "NET TL",
          "KDV TL",
          "TOPLAM TL",
        ],
        lines.map(
          (l) =>
            `<tr><td>${esc(l.code || "")}</td><td>${esc(l.name)}<small>${esc(l.barcode || "")}${l.specialCode ? " · " + esc(l.specialCode) : ""}</small></td><td>${qty(l.quantityMilli)} ${esc(l.unit || "Hizmet")}</td><td>${numberFormat(l.unitPrice)} ${esc(l.currency || "TL")}</td><td>${l.exchangeRate ? l.exchangeRate / 1000000 : 1}</td><td>%${l.vatBps / 100}</td><td>${l.vatIncluded ? "Evet" : "Hayır"}</td><td>%${(l.contactDiscountBps || 0) / 100}</td><td>%${l.discountBps / 100} / %${(l.discount2Bps || 0) / 100} / %${(l.discount3Bps || 0) / 100}</td><td class="num">${numberFormat(l.subtotal)}</td><td class="num">${numberFormat(l.vatAmount)}</td><td class="num">${numberFormat(l.amount)}</td></tr>`,
        ),
      )
    : '<p class="form-note">Önceki sürümden aktarılan toplam tutarlı fatura; ürün / hizmet ayrıntısı bulunmuyor.</p>';
}
function invoiceDetail(id) {
  const i = data.invoices.find((i) => i.id === id);
  if (!i) return;
  const paid = D.paid(data, i.id),
    remaining = i.amount - paid;
  openModal(
    `${i.stockless ? "Stoksuz " : ""}${names[i.type]} faturası · ${i.number}`,
    `<div class="invoice-info"><div><strong>${esc(contactName(i.contactId))}</strong>${esc(i.description)}<br><small>Fatura: ${day(i.date)} · Vade: ${day(i.dueDate)} · ${esc(i.number)}<br>Plasiyer: ${esc(i.salesperson || "—")} · İşlem grubu: ${esc(i.group || "—")} · ${i.cashSale ? "Peşin işlem" : "Açık hesap"}</small></div><div><small>GENEL TOPLAM TL</small><div class="invoice-total">${fmt(i.amount)}</div>${badge(remaining === 0 ? "Kapandı" : "Açık hesap", remaining === 0 ? "green" : "amber")}</div></div>${invoiceLineTable(i)}<div class="totals">${i.subtotal != null ? `<div class="total-row"><span>İskonto</span><strong>${fmt(i.discountAmount)}</strong></div><div class="total-row"><span>Net ara toplam</span><strong>${fmt(i.subtotal)}</strong></div><div class="total-row"><span>KDV</span><strong>${fmt(i.vatAmount)}</strong></div>` : ""}<div class="total-row"><span>Bağlı tahsilat / ödeme</span><strong>${fmt(paid)}</strong></div><div class="total-row final"><span>Kalan tutar</span><strong>${fmt(remaining)}</strong></div></div>${i.attachments?.length ? `<div class="form-section">Ek Belgeler (${i.attachments.length})</div><div class="actions">${i.attachments.map((a) => button("▤ " + esc(a.name), "open-attachment", "secondary small", `data-invoice="${i.id}" data-id="${a.id}"`)).join("")}</div>` : ""}<p class="form-note">Kur ve fiyatlar işlem anındaki değerleriyle saklanır; toplamlar TL'dir. Faturasız avanslar bu faturaya otomatik dağıtılmaz. Bu belge resmi mali belge değildir.</p><div class="form-footer">${button("Sil", "delete", "danger", `data-kind="invoices" data-id="${i.id}"`)}${button("Yazdır", "print", "secondary")}${remaining > 0 ? button(i.type === "sale" ? "Tahsilat al" : "Ödeme yap", "invoice-payment", "", `data-id="${i.id}"`) : ""}</div>`,
    true,
  );
}
async function action(name, el) {
  const id = el?.dataset.id;
  if (name === "card-definitions") return go("contacts");
  if (name === "card-movements") {
    if (lastContactId && data.contacts.some((c) => c.id === lastContactId))
      return go("contacts", lastContactId);
    return contactPicker();
  }
  if (name === "all-reports") return go("reports");
  if (name === "help") return help();
  if (name === "new-cari-transaction") return transactionPicker();
  if (name === "stockless-sale") return stocklessForm("sale");
  if (name === "stockless-purchase") return stocklessForm("purchase");
  if (name === "filter-ledger") return filterForm();
  if (name === "analysis") return analysis();
  if (name === "balance-check") return balanceCheck();
  if (name === "clear-filter") {
    ledgerFilters = { sort: ledgerFilters.sort, desc: ledgerFilters.desc };
    selectedLedger = null;
    render();
    return;
  }
  if (name === "sort-ledger") {
    ledgerFilters = {
      ...ledgerFilters,
      sort: el.dataset.sort,
      desc: ledgerFilters.sort === el.dataset.sort ? !ledgerFilters.desc : true,
    };
    render();
    return;
  }
  if (name === "open-selected") return openLedgerRecord();
  if (name === "delete-selected") {
    const r = D.ledger(data, contactId).find((r) => r.id === selectedLedger);
    if (!r) return;
    if (r.kind === "opening") {
      notice("Devir bakiyesi Cari Bilgileri bölümünden düzenlenir.", true);
      return;
    }
    return action("delete", { dataset: { kind: r.kind, id: r.id } });
  }
  if (name === "expand-ledger") {
    const scroll = document.querySelector(".grid-scroll")?.scrollTop || 0;
    expandedLedger.has(id) ? expandedLedger.delete(id) : expandedLedger.add(id);
    render();
    document.querySelector(".grid-scroll").scrollTop = scroll;
    return;
  }
  if (name === "move-selection") {
    const rows = currentLedgerRows();
    if (!rows.length) return;
    let index = rows.findIndex((r) => r.id === selectedLedger);
    index =
      el.dataset.step === "first"
        ? 0
        : el.dataset.step === "last"
          ? rows.length - 1
          : Math.min(
              rows.length - 1,
              Math.max(0, index + (el.dataset.step === "previous" ? -1 : 1)),
            );
    return selectLedger(rows[index].id, true);
  }
  if (name === "refresh") {
    data = await api(window.accounting.read());
    render();
    notice("Kayıtlar yenilendi.");
    return;
  }
  if (name === "backup") {
    const r = await api(window.accounting.backup());
    if (r) notice(r);
    return;
  }
  if (name === "export-ledger") {
    if (!contactId) return contactPicker();
    const result = await api(
      window.accounting.exportLedger(contactId, ledgerFilters),
    );
    if (result) notice(result);
    return;
  }
  if (name === "back") return go("contacts");
  if (name === "all-invoices") return go("invoices");
  if (name === "new-contact" || name === "edit-contact") return contactForm(id);
  if (name === "new-product" || name === "edit-product") return productForm(id);
  if (name === "new-account" || name === "edit-account") return accountForm(id);
  if (name === "new-invoice") return invoiceForm();
  if (name === "sale-invoice") return invoiceForm("sale");
  if (name === "purchase-invoice") return invoiceForm("purchase");
  if (name === "new-transaction" || name === "receive")
    return paymentForm("income");
  if (name === "pay") return paymentForm("expense");
  if (name === "edit-transaction") {
    const t = data.transactions.find((t) => t.id === id);
    return paymentForm(t.type, t.invoiceId || "", t.contactId || "", t.id);
  }
  if (name === "invoice-detail") return invoiceDetail(id);
  if (name === "open-attachment") {
    try {
      await api(window.accounting.openAttachment(el.dataset.invoice, id));
    } catch (error) {
      document.querySelector("#modal-error").textContent = error.message;
    }
    return;
  }
  if (name === "close-modal") return modal.close();
  if (name === "invoice-payment") {
    const i = data.invoices.find((i) => i.id === id);
    return paymentForm(
      i.type === "sale" ? "income" : "expense",
      id,
      i.contactId,
    );
  }
  if (name === "print") {
    try {
      await api(window.accounting.print());
    } catch (e) {
      notice(e.message, true);
    }
    return;
  }
  if (name === "delete") {
    const kind = el.dataset.kind;
    if (
      !confirm(
        "Bu kayıt silinsin mi? İlgili cari, stok ve kasa bakiyeleri yeniden hesaplanacak.",
      )
    )
      return;
    if (el instanceof HTMLElement) el.disabled = true;
    try {
      data = await api(window.accounting.remove(kind, id));
      if (modal.open) modal.close();
      notice("Kayıt silindi, bakiyeler güncellendi.");
      render();
    } catch (e) {
      if (modal.open)
        document.querySelector("#modal-error").textContent = e.message;
      else notice(e.message, true);
      if (el instanceof HTMLElement) el.disabled = false;
    }
  }
}
document
  .querySelectorAll("nav button")
  .forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-menu]");
  if (toggle) {
    const wasOpen = toggle.getAttribute("aria-expanded") === "true";
    hideMenus();
    if (!wasOpen) {
      toggle.setAttribute("aria-expanded", "true");
      document.querySelector(
        `[data-menu-panel="${toggle.dataset.menu}"]`,
      ).hidden = false;
    }
    return;
  }
  const row = e.target.closest("[data-ledger-row]");
  if (row) selectLedger(row.dataset.ledgerRow);
  const contact = e.target.closest("[data-contact]");
  if (contact) return go("contacts", contact.dataset.contact);
  const tabButton = e.target.closest("[data-tab]");
  if (tabButton) {
    tab = tabButton.dataset.tab;
    render();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (el) {
    hideMenus();
    Promise.resolve(action(el.dataset.action, el)).catch((err) =>
      notice(err.message, true),
    );
  } else if (!e.target.closest(".drop-host")) hideMenus();
});
document.addEventListener("dblclick", (e) => {
  const row = e.target.closest("[data-ledger-row]");
  if (row && !e.target.closest("button")) {
    selectLedger(row.dataset.ledgerRow);
    openLedgerRecord();
  }
});
document.addEventListener("keydown", (e) => {
  if (window.SalesEditor.handleKey(e)) return;
  const openMenu = document.querySelector("[data-menu-panel]:not([hidden])");
  if (openMenu && ["ArrowDown", "ArrowUp", "Escape"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "Escape") {
      hideMenus();
      return;
    }
    const items = [...openMenu.querySelectorAll('[role="menuitem"]')],
      index = items.indexOf(document.activeElement);
    items[
      (index + (e.key === "ArrowDown" ? 1 : items.length - 1) + items.length) %
        items.length
    ]?.focus();
    return;
  }
  if (modal.open) return;
  if (e.key === "F4" && contactId) {
    e.preventDefault();
    transactionPicker();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    if (contactId && tab === "ledger") filterForm();
    else document.querySelector("#search")?.focus();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    e.preventDefault();
    action("print");
    return;
  }
  if (
    !contactId ||
    tab !== "ledger" ||
    e.target.closest("input,select,textarea")
  )
    return;
  if (e.key === "F2") {
    e.preventDefault();
    openLedgerRecord();
    return;
  }
  if (!e.target.closest(".ledger-grid")) return;
  const rows = currentLedgerRows();
  if (!rows.length) return;
  let index = rows.findIndex((r) => r.id === selectedLedger);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    index = Math.max(
      0,
      Math.min(rows.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)),
    );
    selectLedger(rows[index].id, true);
  }
  if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    selectLedger(rows[e.key === "Home" ? 0 : rows.length - 1].id, true);
  }
  if (e.key === "Enter" && !e.target.closest("button")) {
    e.preventDefault();
    openLedgerRecord();
  }
});
document
  .querySelector("#modal-close")
  .addEventListener("click", () => modal.close());
document.querySelector("#backup").addEventListener("click", async () => {
  try {
    const r = await api(window.accounting.backup());
    if (r) notice(r);
  } catch (e) {
    notice(e.message, true);
  }
});
function updateClock() {
  document.querySelector("#today").textContent = new Intl.DateTimeFormat(
    "tr-TR",
    { dateStyle: "short", timeStyle: "medium" },
  ).format(new Date());
}
updateClock();
setInterval(updateClock, 1000);
(async () => {
  try {
    data = await api(window.accounting.read());
    render();
  } catch (e) {
    notice(e.message, true);
  }
})();
