(function () {
  "use strict";
  const D = window.AccountingDomain;
  let editor = null;
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const moneyText = (n) =>
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n / 100);
  const raw = (n) => String(n / 100);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  function field(name, title, value = "", options = {}) {
    return `<label class="sale-field"><span>${title}</span><input name="${name}" aria-label="${esc(options.label || title)}" value="${esc(value)}" type="${options.type || "text"}" ${options.required ? "required" : ""} ${options.readonly ? "readonly" : ""} ${options.decimal ? 'inputmode="decimal"' : ""} maxlength="300" ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ""}></label>`;
  }
  function choice(name, title, values, value = "", options = {}) {
    return `<label class="sale-field"><span>${title}</span><select name="${name}" aria-label="${esc(options.label || title)}" ${options.required ? "required" : ""}>${values.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  }
  const tool = (title, action, extra = "") =>
    `<button type="button" data-sale-action="${action}" ${extra}>${title}</button>`;
  const currencies = [
    ["TL", "TL"],
    ["USD", "USD"],
    ["EUR", "EUR"],
  ];
  function open(options) {
    const { data, type, stockless, contactId } = options;
    const contact = data.contacts.find((c) => c.id === contactId);
    const title = `${stockless ? "STOKSUZ" : "STOKLU"} ${type === "sale" ? "SATIŞ" : "ALIŞ"}`;
    const prefix = stockless
      ? type === "sale"
        ? "SS"
        : "SA"
      : type === "sale"
        ? "SAT"
        : "ALI";
    let n = data.invoices.length + 1;
    while (
      data.invoices.some(
        (i) =>
          i.number ===
          `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`,
      )
    )
      n++;
    const entryNo =
      [...data.invoices, ...data.transactions].reduce(
        (max, r, i) => Math.max(max, r.entryNo || i + 1),
        0,
      ) + 1;
    editor = { ...options, title, savedId: null, busy: false, attachments: [] };
    const contacts = [
      ["", "Cari seçin"],
      ...data.contacts.map((c) => [c.id, c.name]),
    ];
    const codes = [
      ["", "Kod seçin"],
      ...data.contacts.map((c, i) => [c.id, c.code || String(i + 1)]),
    ];
    options.openDialog(
      "Yeni : " + title,
      `<form id="sales-form" novalidate>
      <div class="sale-commandbar"><span id="sale-state" class="sale-state">● KAYDEDİLMEDİ</span><span class="sale-open-state">▣ AÇIK</span><span class="sale-command-separator"></span>${tool("⊞ Satır Ekle", "add-row")}<div class="sale-save-actions"><button type="submit" data-save="stay">✓ Kaydet F6</button>${tool("✕ İptal Et ve Kapat", "cancel")}<button type="submit" data-save="close">✓ Kaydet ve Kapat F8</button></div></div>
      <div class="sale-upper">
        <fieldset class="sale-box sale-document"><legend><span>${title}</span><label class="sale-check"><input type="checkbox" name="cashSale" aria-label="${type === "sale" ? "Peşin satış" : "Peşin alış"}"> PEŞİN ${type === "sale" ? "SATIŞ" : "ALIŞ"}</label></legend><div class="sale-document-columns"><div>${field("entryNo", "İşlem No", entryNo, { readonly: true })}${field("number", type === "sale" ? "Satış No" : "Alış No", `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`, { required: true, label: "Fatura numarası" })}${field("documentNo", "Belge No", "", { label: "Belge numarası" })}${field("date", "Tarih", today(), { type: "date", required: true, label: "Fatura tarihi" })}</div><div class="sale-currencies"><div class="sale-rate-title">İşlem İçin Kullanılan Kurlar</div>${field("usdRate", "USD kuru", "", { decimal: true, placeholder: "Elle girin" })}${field("eurRate", "EUR kuru", "", { decimal: true, placeholder: "Elle girin" })}<label class="sale-check sale-fixed"><input type="checkbox" name="fixedCurrency" checked aria-label="Sabit para birimi"> Sabit Para Birimi</label>${choice("currency", "Para birimi", currencies, "TL", { label: "İşlem para birimi" })}${field("group", "İşlem Grubu", "", { label: "İşlem grubu" })}</div></div>${field("description", "Açıklama", stockless ? "" : type === "sale" ? "Ürün satışı" : "Ürün alışı", { label: "Belge açıklaması", required: !stockless })}</fieldset>
        <fieldset class="sale-box sale-totals"><legend>TOPLAMLAR · TL</legend><div class="sale-total-line"><span>Toplam Tutar</span><output id="sale-gross">0,00</output><span>TL</span></div><div class="sale-total-line"><span>İskonto Tutarı</span><output id="sale-discount">0,00</output><span>TL</span></div><div class="sale-total-line"><span>KDV Tutarı</span><output id="sale-vat">0,00</output><span>TL</span></div><output id="sale-grand" class="sale-grand">0,00</output><span class="sale-totals-note">Toplamlar TL · İskonto sırası: cari → 1 → 2 → 3</span></fieldset>
        <div class="sale-party-row"><fieldset class="sale-box sale-party"><legend>Cari Hesap</legend>${choice("contactCode", "Kodu", codes, contactId || "", { label: "Cari kodu" })}${choice("contactId", "Unvanı", contacts, contactId || "", { required: true, label: "Cari hesap" })}</fieldset><fieldset class="sale-box sale-discounts"><legend>İskontolar</legend>${field("contactDiscount", "Cari İsk. %", (contact?.discountBps || 0) / 100, { required: true, decimal: true, label: "Cari iskonto oranı" })}<span>KDV öncesi sıralı iskonto</span></fieldset></div>
        <fieldset class="sale-box sale-options"><legend>Vade ve Ek Belgeler</legend>${field("salesperson", "Plasiyer", "")}${field("dueDate", "Vade Tarihi", today(), { type: "date", required: true, label: "Vade tarihi" })}<div class="sale-attachment-row"><span>Ek Belgeler</span>${tool("EK BELGE YOK", "attachments", 'id="sale-attachments"')}<span class="sale-file-note">PDF / resim</span></div><div id="sale-cash-account" hidden>${choice("cashAccountId", "Kasa / banka", [["", "Hesap seçin"], ...data.accounts.map((a) => [a.id, a.name])], "", { label: "Peşin kasa / banka" })}</div></fieldset>
      </div>
      <div id="sale-files" class="sale-files" hidden></div>
      <div class="sale-detail-caption"><strong>DETAY</strong><span>${stockless ? "STOKSUZ İŞLEM · Stok miktarı değişmez" : "STOKLU İŞLEM · Kaydedildiğinde stok güncellenir"}</span>${tool("Stok Kartından Bul F11", "focus-search")}<span>F6 Kaydet · F8 Kaydet ve Kapat</span></div>
      <div class="sale-quick-entry"><label>Kod / Barkod / Ürün<input id="sale-quick-search" aria-label="Stok kartı ara" list="sale-product-list" placeholder="Kod, barkod veya ad"><datalist id="sale-product-list">${data.products.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}${p.barcode ? " · " + esc(p.barcode) : ""}</option>`).join("")}</datalist></label><label>Ürün / Hizmet Adı<input id="sale-quick-name" aria-label="Hızlı ürün / hizmet adı" ${stockless ? "" : "readonly"}></label><label>Barkodu<input id="sale-quick-barcode" aria-label="Hızlı barkod"></label><label>Özel kod<input id="sale-quick-special" aria-label="Hızlı özel kod"></label><label>Miktarı<input id="sale-quick-quantity" value="1" inputmode="decimal" aria-label="Hızlı miktar"></label><label>Birim Fiyat<input id="sale-quick-price" value="0" inputmode="decimal" aria-label="Hızlı birim fiyat"></label>${tool("↓ Satıra Ekle", "quick-add")}</div>
      <div class="sale-lines-scroll"><table class="sale-lines"><colgroup><col width="75"><col width="250"><col width="75"><col width="72"><col width="95"><col width="75"><col width="55"><col width="55"><col width="65"><col width="60"><col width="60"><col width="60"><col width="100"><col width="110"><col width="110"><col width="95"><col width="95"><col width="115"><col width="30"></colgroup><thead><tr>${["Kodu", "Ürün / Hizmet Adı", "Birimi", "Miktarı", "Birim Fiyat", "Para Birimi", "KDV %", "Dahil?", "Cari İSK%", "İSK1%", "İSK2%", "İSK3%", "Birim Fiyat [TL]", "Toplam Tutar [TL]", "İsk. Birim Fiyat [TL]", "İskonto [TL]", "KDV Tutarı [TL]", "Satır Toplamı [TL]", ""].map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody id="sale-lines"></tbody></table></div>
      <div class="sale-lines-bottom">${tool("＋ Ürün / Hizmet Satırı Ekle", "add-row")}<span id="sale-row-count"></span><span id="sale-live-message">Fiyatlar seçilen para birimindedir. Bakiye ve tahsilatlar TL olarak kaydedilir.</span><strong id="sale-footer-total">0,00 TL</strong></div>
      <div class="sale-bottom-info"><span>Birim fiyat 2, miktar 3, döviz kuru 6 ondalık basamak · Kur otomatik alınmaz.</span>${field("deliveryNo", "İrsaliye No", "", { label: "İrsaliye numarası" })}${field("receiptNo", "Fiş No", "", { label: "Fiş numarası (boşsa otomatik)" })}</div>
    </form>`,
      true,
    );
    const modal = document.querySelector("#modal");
    modal.classList.add("sales-window");
    editor.modal = modal;
    editor.form = modal.querySelector("#sales-form");
    const form = editor.form;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save(e.submitter?.dataset.save === "stay" ? false : true);
    });
    form.addEventListener("click", async (e) => {
      const target = e.target.closest("[data-sale-action]");
      if (!target) return;
      const action = target.dataset.saleAction;
      if (action === "cancel") modal.close();
      if (editor.savedId || editor.busy) return;
      if (action === "add-row") addRow();
      if (action === "remove-row") {
        target.closest(".sale-line").remove();
        totals();
      }
      if (action === "focus-search")
        document.querySelector("#sale-quick-search").focus();
      if (action === "quick-add") quickAdd();
      if (action === "attachments") await pickAttachments();
      if (action === "remove-file") {
        editor.attachments.splice(Number(target.dataset.index), 1);
        renderFiles();
      }
    });
    form.elements.contactCode.addEventListener("change", () =>
      setContact(form.elements.contactCode.value),
    );
    form.elements.contactId.addEventListener("change", () =>
      setContact(form.elements.contactId.value),
    );
    form.elements.cashSale.addEventListener("change", () => {
      const checked = form.elements.cashSale.checked;
      document.querySelector("#sale-cash-account").hidden = !checked;
      form.elements.cashAccountId.required = checked;
      form.querySelector(".sale-open-state").textContent = checked
        ? "▣ PEŞİN"
        : "▣ AÇIK HESAP";
    });
    form.elements.currency.addEventListener("change", applyFixedCurrency);
    form.elements.fixedCurrency.addEventListener("change", applyFixedCurrency);
    for (const name of ["usdRate", "eurRate", "contactDiscount"])
      form.elements[name].addEventListener("input", totals);
    document
      .querySelector("#sale-quick-search")
      .addEventListener("change", quickProduct);
    document
      .querySelector("#sale-quick-barcode")
      .addEventListener("change", quickProduct);
    document
      .querySelector("#sale-quick-special")
      .addEventListener("change", quickProduct);
    for (const id of ["sale-quick-search", "sale-quick-barcode"])
      document.querySelector("#" + id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          quickProduct(e);
          quickAdd();
        }
      });
    addRow();
  }
  function setContact(id) {
    const form = editor.form;
    form.elements.contactId.value = id;
    form.elements.contactCode.value = id;
    form.elements.contactDiscount.value =
      (editor.data.contacts.find((c) => c.id === id)?.discountBps || 0) / 100;
    totals();
  }
  function fx(currency) {
    return currency === "TL"
      ? 1000000
      : D.exchangeRate(
          editor.form.elements[currency === "USD" ? "usdRate" : "eurRate"]
            .value,
        );
  }
  function convertedPrice(price, currency) {
    return raw(D.convertPrice(price, 1000000, fx(currency)));
  }
  function currencyChange(row, currency) {
    const el = row.querySelector('[data-field="currency"]'),
      previous = row.dataset.currency || el.value;
    if (previous !== currency) {
      const price = row.querySelector('[data-field="unitPrice"]');
      try {
        price.value = raw(
          D.convertPrice(
            D.money(price.value, true),
            fx(previous),
            fx(currency),
          ),
        );
      } catch {
        if (price.value !== "0") price.value = "";
      }
    }
    el.value = currency;
    row.dataset.currency = currency;
    totals();
  }
  function applyFixedCurrency() {
    for (const row of editor.form.querySelectorAll(".sale-line")) {
      const currency = row.querySelector('[data-field="currency"]');
      if (editor.form.elements.fixedCurrency.checked)
        currencyChange(row, editor.form.elements.currency.value);
      currency.disabled = editor.form.elements.fixedCurrency.checked;
    }
    totals();
  }
  function readRow(row) {
    return Object.fromEntries(
      [...row.querySelectorAll("[data-field]")].map((input) => [
        input.dataset.field,
        input.type === "checkbox" ? input.checked : input.value,
      ]),
    );
  }
  function calculate(input) {
    const form = editor.form,
      currency = form.elements.fixedCurrency.checked
        ? form.elements.currency.value
        : input.currency;
    return D.line({
      ...input,
      currency,
      exchangeRate:
        currency === "TL"
          ? "1"
          : form.elements[currency === "USD" ? "usdRate" : "eurRate"].value,
      contactDiscount: form.elements.contactDiscount.value,
    });
  }
  function rowInput(name, label, value, options = {}) {
    return `<input data-field="${name}" aria-label="${label}" value="${esc(value)}" ${options.type ? `type="${options.type}"` : ""} ${options.checked ? "checked" : ""} ${options.required ? "required" : ""} ${options.readonly ? "readonly" : ""} ${options.decimal ? 'inputmode="decimal"' : ""} maxlength="${options.decimal ? "25" : "300"}">`;
  }
  function addRow(source = {}) {
    const body = editor.form.querySelector("#sale-lines");
    if (body.children.length >= 100) {
      error("En fazla 100 satır ekleyin.");
      return;
    }
    const row = document.createElement("tr");
    row.className = "sale-line";
    row.dataset.currency = editor.form.elements.currency.value;
    const nameCell = editor.stockless
      ? rowInput("name", "İşlem açıklaması / hizmet adı", source.name || "", {
          required: true,
        })
      : `<select data-field="productId" aria-label="Satır ürünü" required><option value="">Ürün seçin</option>${editor.data.products.map((p) => `<option value="${p.id}">${esc(p.code)} · ${esc(p.name)} (${esc(p.unit)})</option>`).join("")}</select>`;
    row.innerHTML = `<td>${rowInput("code", "Satır kodu", source.code || "", { readonly: !editor.stockless })}</td><td>${nameCell}${rowInput("barcode", "Satır barkodu", source.barcode || "", { type: "hidden" })}${rowInput("specialCode", "Satır özel kodu", source.specialCode || "", { type: "hidden" })}</td><td>${rowInput("unit", "Satır birimi", source.unit || (editor.stockless ? "Hizmet" : ""), { readonly: !editor.stockless, required: editor.stockless })}</td><td>${rowInput("quantity", "Miktar", source.quantity || "1", { required: true, decimal: true })}</td><td>${rowInput("unitPrice", "Birim fiyat", source.unitPrice || "0", { required: true, decimal: true })}</td><td><select data-field="currency" aria-label="Satır para birimi" ${editor.form.elements.fixedCurrency.checked ? "disabled" : ""}>${currencies.map(([v, t]) => `<option value="${v}" ${v === editor.form.elements.currency.value ? "selected" : ""}>${t}</option>`).join("")}</select></td><td>${rowInput("vatRate", "KDV oranı", source.vatRate || "20", { required: true, decimal: true })}</td><td class="check-cell">${rowInput("vatIncluded", "KDV dahil fiyat", "", { type: "checkbox" })}</td><td class="num" data-output="contactDiscount">0</td><td>${rowInput("discount", "İskonto oranı", "0", { required: true, decimal: true })}</td><td>${rowInput("discount2", "İskonto 2", "0", { required: true, decimal: true })}</td><td>${rowInput("discount3", "İskonto 3", "0", { required: true, decimal: true })}</td>${["unitPriceTL", "gross", "discountedUnitPriceTL", "discountAmount", "vatAmount", "amount"].map((k) => `<td class="num" data-output="${k}">0,00</td>`).join("")}<td>${tool("×", "remove-row", 'aria-label="Satırı kaldır"')}</td>`;
    row.querySelectorAll("td").forEach((cell, index) => {
      cell.dataset.label = editor.form.querySelectorAll(".sale-lines thead th")[index].textContent || "İşlem";
    });
    body.append(row);
    const product = row.querySelector('[data-field="productId"]');
    if (product) {
      product.addEventListener("change", () =>
        applyProduct(row, product.value),
      );
      if (source.productId) {
        product.value = source.productId;
        applyProduct(row, source.productId);
        if (source.quantity)
          row.querySelector('[data-field="quantity"]').value = source.quantity;
        if (source.unitPrice)
          row.querySelector('[data-field="unitPrice"]').value =
            source.unitPrice;
      }
    }
    row
      .querySelector('[data-field="currency"]')
      .addEventListener("change", (e) => currencyChange(row, e.target.value));
    row.addEventListener("input", totals);
    row.addEventListener("change", totals);
    totals();
    return row;
  }
  function applyProduct(row, id) {
    const p = editor.data.products.find((p) => p.id === id);
    if (!p) return;
    for (const key of ["code", "barcode", "specialCode", "unit"])
      row.querySelector(`[data-field="${key}"]`).value = p[key] || "";
    const price = editor.type === "sale" ? p.salePrice : p.purchasePrice;
    try {
      row.querySelector('[data-field="unitPrice"]').value = convertedPrice(
        price,
        row.querySelector('[data-field="currency"]').value,
      );
    } catch {
      row.querySelector('[data-field="unitPrice"]').value = "";
    }
    row.querySelector('[data-field="vatRate"]').value = p.vatBps / 100;
    row.querySelector('[data-field="vatIncluded"]').checked = false;
    totals();
  }
  function quickProduct(event) {
    const query = document
        .querySelector("#sale-quick-search")
        .value.trim()
        .toLocaleLowerCase("tr"),
      barcode = document.querySelector("#sale-quick-barcode").value.trim();
    const token =
      event?.target?.id === "sale-quick-special"
        ? document
            .querySelector("#sale-quick-special")
            .value.trim()
            .toLocaleLowerCase("tr")
        : event?.target?.id === "sale-quick-barcode"
          ? barcode.toLocaleLowerCase("tr")
          : query;
    const exact = editor.data.products.find(
      (p) =>
        (p.barcode && p.barcode.toLocaleLowerCase("tr") === token) ||
        p.code.toLocaleLowerCase("tr") === token,
    );
    const matches = token
      ? editor.data.products.filter(
          (p) =>
            p.name.toLocaleLowerCase("tr") === token ||
            (p.specialCode && p.specialCode.toLocaleLowerCase("tr") === token),
        )
      : [];
    const product = exact || (matches.length === 1 ? matches[0] : null);
    if (!exact && matches.length > 1)
      error(
        "Bu ad / özel kod birden çok kartta var. Ürün koduyla seçim yapın.",
      );
    editor.quickProductId = product?.id || "";
    if (!product) return;
    error("");
    document.querySelector("#sale-quick-search").value = product.code;
    document.querySelector("#sale-quick-name").value = product.name;
    document.querySelector("#sale-quick-barcode").value = product.barcode || "";
    document.querySelector("#sale-quick-special").value =
      product.specialCode || "";
    try {
      document.querySelector("#sale-quick-price").value = convertedPrice(
        editor.type === "sale" ? product.salePrice : product.purchasePrice,
        editor.form.elements.currency.value,
      );
    } catch {
      document.querySelector("#sale-quick-price").value = "";
    }
  }
  function quickAdd() {
    const p = editor.data.products.find((p) => p.id === editor.quickProductId);
    const source = {
      productId: p?.id,
      code: p?.code || document.querySelector("#sale-quick-search").value,
      name: document.querySelector("#sale-quick-name").value,
      barcode: document.querySelector("#sale-quick-barcode").value,
      specialCode: document.querySelector("#sale-quick-special").value,
      unit: p?.unit || "Hizmet",
      quantity: document.querySelector("#sale-quick-quantity").value,
      unitPrice: document.querySelector("#sale-quick-price").value,
      vatRate: p ? String(p.vatBps / 100) : "20",
    };
    if (
      (!editor.stockless && !p) ||
      (editor.stockless && !source.name.trim())
    ) {
      error(
        editor.stockless
          ? "Ürün / hizmet adı girin."
          : "Geçerli bir stok kartı seçin.",
      );
      return;
    }
    try {
      calculate({ ...source, currency: editor.form.elements.currency.value });
    } catch (e) {
      error(e.message);
      return;
    }
    let row = [...editor.form.querySelectorAll(".sale-line")].find((row) =>
      editor.stockless
        ? !row.querySelector('[data-field="name"]').value
        : !row.querySelector('[data-field="productId"]').value,
    );
    if (!row) row = addRow(source);
    else {
      row.querySelector('[data-field="currency"]').value =
        editor.form.elements.currency.value;
      row.dataset.currency = editor.form.elements.currency.value;
      if (p && !editor.stockless) {
        row.querySelector('[data-field="productId"]').value = p.id;
        applyProduct(row, p.id);
      }
      for (const [key, value] of Object.entries(source)) {
        const input = row.querySelector(`[data-field="${key}"]`);
        if (input && value != null) input.value = value;
      }
    }
    error("");
    totals();
    row?.scrollIntoView({ block: "nearest" });
  }
  function totals() {
    if (!editor?.form) return;
    const sums = { gross: 0, discountAmount: 0, vatAmount: 0, amount: 0 };
    let invalid = false;
    for (const row of editor.form.querySelectorAll(".sale-line")) {
      try {
        const result = calculate(readRow(row));
        for (const key of Object.keys(sums))
          sums[key] = D.safe(sums[key] + result[key]);
        for (const cell of row.querySelectorAll("[data-output]"))
          cell.textContent =
            cell.dataset.output === "contactDiscount"
              ? result.contactDiscountBps / 100
              : moneyText(result[cell.dataset.output]);
        row.classList.remove("sale-invalid");
      } catch {
        invalid = true;
        row.classList.add("sale-invalid");
        row.querySelector('[data-output="amount"]').textContent =
          "Tutar / kur?";
      }
    }
    for (const [id, key] of [
      ["sale-gross", "gross"],
      ["sale-discount", "discountAmount"],
      ["sale-vat", "vatAmount"],
      ["sale-grand", "amount"],
    ])
      document.querySelector("#" + id).textContent = invalid
        ? "—"
        : moneyText(sums[key]);
    document.querySelector("#sale-footer-total").textContent = invalid
      ? "Tutar / kur eksik"
      : moneyText(sums.amount) + " TL";
    document.querySelector("#sale-row-count").textContent =
      `${editor.form.querySelectorAll(".sale-line").length} satır`;
  }
  function error(message) {
    document.querySelector("#modal-error").textContent = message;
  }
  async function pickAttachments() {
    const draft = editor;
    if (draft.picking) return;
    draft.picking = true;
    try {
      const picked = await draft.api(window.accounting.pickAttachments());
      if (
        editor !== draft ||
        !draft.modal.open ||
        !draft.form.isConnected ||
        !draft.modal.classList.contains("sales-window") ||
        draft.savedId
      )
        return;
      if (picked?.length) {
        if (picked.length + draft.attachments.length > 5)
          throw Error("En fazla 5 ek belge ekleyin.");
        draft.attachments.push(...picked);
        renderFiles();
      }
    } catch (e) {
      if (editor === draft && draft.modal.open && draft.form.isConnected)
        error(e.message);
    } finally {
      draft.picking = false;
    }
  }
  function renderFiles() {
    const container = document.querySelector("#sale-files");
    container.hidden = !editor.attachments.length;
    document.querySelector("#sale-attachments").textContent = editor.attachments
      .length
      ? `${editor.attachments.length} EK BELGE`
      : "EK BELGE YOK";
    container.innerHTML = editor.attachments
      .map(
        (file, index) =>
          `<span>▤ ${esc(file.name)} (${Math.ceil(file.size / 1024)} KB) ${tool("×", "remove-file", `data-index="${index}" aria-label="Belgeyi kaldır"`)}</span>`,
      )
      .join("");
  }
  async function save(close) {
    if (editor.savedId) {
      if (close) editor.modal.close();
      return;
    }
    if (editor.picking) {
      error("Ek belge seçiminin tamamlanmasını bekleyin.");
      return;
    }
    if (editor.busy || !editor.form.reportValidity()) return;
    error("");
    const form = editor.form,
      lines = [...form.querySelectorAll(".sale-line")].map(readRow);
    if (!lines.length) {
      error("En az bir ürün / hizmet satırı girin.");
      return;
    }
    const fields = Object.fromEntries(new FormData(form));
    const payload = {
      ...fields,
      type: editor.type,
      stockless: editor.stockless,
      cashSale: form.elements.cashSale.checked,
      fixedCurrency: form.elements.fixedCurrency.checked,
      currency: form.elements.currency.value,
      exchangeRates: {
        USD: form.elements.usdRate.value,
        EUR: form.elements.eurRate.value,
      },
      contactDiscount: form.elements.contactDiscount.value,
      attachments: editor.attachments,
      description:
        form.elements.description.value.trim() ||
        lines[0].name ||
        "Ürün satışı",
      ...(editor.stockless ? { lines } : { items: lines }),
    };
    const controls = [...form.querySelectorAll("input,select,button")].map(
      (el) => [el, el.disabled],
    );
    editor.busy = true;
    controls.forEach(([el]) => (el.disabled = true));
    document.querySelector("#modal-close").disabled = true;
    try {
      const next = await editor.api(window.accounting.add("invoices", payload));
      editor.data = next;
      editor.savedId = next.invoices.at(-1).id;
      editor.onSaved(next);
      form.elements.entryNo.value = next.invoices.at(-1).entryNo;
      document.querySelector("#modal-title").textContent =
        "Kaydedildi : " + editor.title + " · " + next.invoices.at(-1).number;
      document.querySelector("#sale-state").textContent = "✓ KAYDEDİLDİ";
      document.querySelector("#sale-state").classList.add("saved");
      form.querySelector('[data-save="close"]').disabled = false;
      form.querySelector('[data-sale-action="cancel"]').disabled = false;
      form.querySelector('[data-sale-action="cancel"]').textContent = "Kapat";
      if (close) editor.modal.close();
    } catch (e) {
      controls.forEach(([el, disabled]) => (el.disabled = disabled));
      error(e.message);
    } finally {
      editor.busy = false;
      document.querySelector("#modal-close").disabled = false;
    }
  }
  function handleKey(e) {
    if (
      !editor?.modal?.open ||
      !editor.modal.classList.contains("sales-window")
    )
      return false;
    if (["F6", "F8", "F11"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "F11") document.querySelector("#sale-quick-search").focus();
      else save(e.key === "F8");
      return true;
    }
    return false;
  }
  document.querySelector("#modal").addEventListener("cancel", (event) => {
    if (editor?.busy && editor.modal.classList.contains("sales-window"))
      event.preventDefault();
  });
  window.SalesEditor = { open, handleKey };
})();
