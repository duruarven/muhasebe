(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AccountingDomain = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX = 9_000_000_000_000;
  function safe(n) {
    if (!Number.isSafeInteger(n) || Math.abs(n) > MAX)
      throw Error("Tutar veya miktar işlem sınırını aşıyor.");
    return n;
  }
  function decimal(value, places, name, allowZero = false) {
    const s = String(value ?? "")
      .trim()
      .replace(",", ".");
    if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(s))
      throw Error(`${name}: en fazla ${places} ondalık basamak kullanın.`);
    const [whole, fraction = ""] = s.split(".");
    const n = safe(
      Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0")),
    );
    if (n < 0 || (!allowZero && n === 0))
      throw Error(`${name} sıfırdan büyük olmalı.`);
    return n;
  }
  const money = (v, allowZero = false) => decimal(v, 2, "Tutar", allowZero);
  const quantity = (v, allowZero = false) => decimal(v, 3, "Miktar", allowZero);
  function rate(v) {
    const n = decimal(v, 2, "Oran", true);
    if (n > 10000) throw Error("Oran %0 ile %100 arasında olmalı.");
    return n;
  }
  const rounded = (a, b, divisor) =>
    safe(
      Number((BigInt(a) * BigInt(b) + BigInt(divisor / 2)) / BigInt(divisor)),
    );
  function line(input) {
    const quantityMilli = quantity(input.quantity),
      unitPrice = money(input.unitPrice, true);
    const vatBps = rate(input.vatRate ?? "20"),
      discountBps = rate(input.discount ?? "0");
    const gross = rounded(quantityMilli, unitPrice, 1000);
    const discountAmount = rounded(gross, discountBps, 10000);
    const subtotal = gross - discountAmount;
    const vatAmount = rounded(subtotal, vatBps, 10000);
    return {
      quantityMilli,
      unitPrice,
      vatBps,
      discountBps,
      discountAmount,
      subtotal,
      vatAmount,
      amount: safe(subtotal + vatAmount),
    };
  }
  const paid = (data, invoiceId) =>
    data.transactions
      .filter((t) => t.invoiceId === invoiceId)
      .reduce((s, t) => safe(s + t.amount), 0);
  function ledger(data, contactId) {
    const c = data.contacts.find((c) => c.id === contactId);
    if (!c) return [];
    const rows = [];
    const records = [...data.invoices, ...data.transactions];
    const number = (record) =>
      record.entryNo || records.findIndex((r) => r.id === record.id) + 1;
    if (c.openingBalance)
      rows.push({
        id: "opening",
        kind: "opening",
        date: c.openingDate,
        description: "Açılış / devir bakiyesi",
        debit: Math.max(0, c.openingBalance),
        credit: Math.max(0, -c.openingBalance),
        order: "",
        entryNo: 0,
        operation: "opening",
        type: "DEVİR",
        receiptNo: "DEVİR",
        invoiceNo: "",
        dueDate: c.openingDate,
      });
    data.invoices
      .filter((i) => i.contactId === contactId)
      .forEach((i) =>
        rows.push({
          id: i.id,
          kind: "invoices",
          date: i.date,
          description: i.description || "",
          debit: i.type === "sale" ? i.amount : 0,
          credit: i.type === "purchase" ? i.amount : 0,
          order: i.createdAt || "",
          entryNo: number(i),
          operation: i.type,
          type: `${i.items?.length ? "STOKLU" : "STOKSUZ"} ${i.type === "sale" ? "SATIŞ" : "ALIŞ"}`,
          receiptNo: i.receiptNo || i.number,
          invoiceNo: i.number,
          dueDate: i.dueDate || i.date,
          deliveryNo: i.deliveryNo || "",
          documentNo: i.documentNo || "",
          group: i.group || "",
          accountId: "",
        }),
      );
    data.transactions
      .filter((t) => t.contactId === contactId)
      .forEach((t) =>
        rows.push({
          id: t.id,
          kind: "transactions",
          date: t.date,
          description: t.description,
          debit: t.type === "expense" ? t.amount : 0,
          credit: t.type === "income" ? t.amount : 0,
          order: t.createdAt || "",
          entryNo: number(t),
          operation: t.type,
          type: t.type === "income" ? "TAHSİLAT" : "ÖDEME",
          receiptNo:
            t.receiptNo ||
            `${t.type === "income" ? "TAH" : "ODE"}-${number(t)}`,
          invoiceNo:
            data.invoices.find((i) => i.id === t.invoiceId)?.number || "",
          dueDate: t.date,
          deliveryNo: t.deliveryNo || "",
          documentNo: t.documentNo || "",
          group: t.group || "",
          accountId: t.accountId,
        }),
      );
    rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.order.localeCompare(b.order) ||
        a.entryNo - b.entryNo ||
        a.id.localeCompare(b.id),
    );
    let balance = 0;
    return rows.map((r) => ({
      ...r,
      amount: r.debit + r.credit,
      direction: r.debit ? "BORÇ" : "ALACAK",
      balance: (balance = safe(balance + r.debit - r.credit)),
    }));
  }
  function filterLedger(rows, filters = {}) {
    const query = String(filters.query || "")
      .trim()
      .toLocaleLowerCase("tr");
    const result = rows.filter(
      (r) =>
        (!filters.from || r.date >= filters.from) &&
        (!filters.to || r.date <= filters.to) &&
        (!filters.operation || r.operation === filters.operation) &&
        (!query ||
          [
            r.description,
            r.type,
            r.receiptNo,
            r.invoiceNo,
            r.documentNo,
            r.group,
          ].some((v) =>
            String(v || "")
              .toLocaleLowerCase("tr")
              .includes(query),
          )),
    );
    const key = ["date", "entryNo", "type", "amount", "dueDate"].includes(
      filters.sort,
    )
      ? filters.sort
      : "date";
    const direction = filters.desc === false ? 1 : -1;
    return result.sort((a, b) => {
      const compare =
        typeof a[key] === "number"
          ? a[key] - b[key]
          : String(a[key]).localeCompare(String(b[key]), "tr");
      return direction * (compare || a.entryNo - b.entryNo);
    });
  }
  function auditContact(data, contactId) {
    const c = data.contacts.find((c) => c.id === contactId);
    if (!c) throw Error("Cari bulunamadı.");
    const rows = ledger(data, contactId),
      issues = [];
    const invoices = data.invoices.filter((i) => i.contactId === contactId);
    const transactions = data.transactions.filter(
      (t) => t.contactId === contactId,
    );
    for (const i of invoices) {
      const lines = i.stockless ? [i.serviceLine].filter(Boolean) : i.items;
      if (
        Array.isArray(lines) &&
        lines.length &&
        lines.reduce((n, l) => n + l.amount, 0) !== i.amount
      )
        issues.push(`${i.number}: satır ve fatura toplamları uyuşmuyor.`);
      if (paid(data, i.id) > i.amount)
        issues.push(`${i.number}: bağlı ödeme fatura toplamını aşıyor.`);
    }
    for (const t of transactions) {
      if (!data.accounts.some((a) => a.id === t.accountId))
        issues.push(`${t.receiptNo || t.id}: kasa/banka hesabı bulunamıyor.`);
      if (
        t.invoiceId &&
        !invoices.some(
          (i) =>
            i.id === t.invoiceId &&
            i.type === (t.type === "income" ? "sale" : "purchase"),
        )
      )
        issues.push(`${t.receiptNo || t.id}: fatura bağlantısı tutarsız.`);
    }
    const expected =
      (c.openingBalance || 0) +
      invoices.reduce(
        (n, i) => n + (i.type === "sale" ? i.amount : -i.amount),
        0,
      ) +
      transactions.reduce(
        (n, t) => n + (t.type === "expense" ? t.amount : -t.amount),
        0,
      );
    const balance = rows.at(-1)?.balance || 0;
    if (expected !== balance)
      issues.push("Hareket toplamı ile ekstre bakiyesi uyuşmuyor.");
    return {
      balance,
      debit: rows.reduce((n, r) => n + r.debit, 0),
      credit: rows.reduce((n, r) => n + r.credit, 0),
      count: rows.length,
      issues,
    };
  }
  function ledgerCsv(data, contactId, filters = {}) {
    const cell = (value) => {
      let text = String(value ?? "");
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const amount = (n) => (n / 100).toFixed(2).replace(".", ",");
    const rows = filterLedger(ledger(data, contactId), filters);
    return (
      "\ufeff" +
      [
        [
          "Tarih",
          "İşlem no",
          "İşlem türü",
          "Fiş no",
          "Fatura no",
          "Cari türü",
          "Tutar TL",
          "Vade tarihi",
          "Açıklama",
          "Bakiye TL (işletmenin alacağı + / borcu -)",
          "İrsaliye no",
          "Belge no",
          "İşlem grubu",
        ],
        ...rows.map((r) => [
          r.date,
          r.entryNo,
          r.type,
          r.receiptNo,
          r.invoiceNo,
          r.direction,
          amount(r.amount),
          r.dueDate,
          r.description,
          amount(r.balance),
          r.deliveryNo,
          r.documentNo,
          r.group,
        ]),
      ]
        .map((row) => row.map(cell).join(";"))
        .join("\r\n")
    );
  }
  const balance = (data, contactId) =>
    ledger(data, contactId).at(-1)?.balance || 0;
  function stock(data, productId) {
    let n = data.products.find((p) => p.id === productId)?.openingStock || 0;
    for (const i of data.invoices)
      for (const item of i.items || [])
        if (item.productId === productId)
          n = safe(
            n +
              (i.type === "purchase"
                ? item.quantityMilli
                : -item.quantityMilli),
          );
    return n;
  }
  return {
    safe,
    money,
    quantity,
    rate,
    line,
    paid,
    ledger,
    filterLedger,
    auditContact,
    ledgerCsv,
    balance,
    stock,
  };
});
