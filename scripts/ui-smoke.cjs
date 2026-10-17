// Exercises the real renderer and Store through a test bridge; does not emulate Electron printing.
const { chromium, _electron } = require('playwright-core');
const { Store } = require('../src/store');
const D = require('../src/domain');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isletmem-ui-'));
  const store = new Store(path.join(dir, 'muhasebe.json'));
  const src = path.resolve(__dirname, '../src');
  const server = http.createServer((req, res) => {
    const file = path.join(src, path.basename(new URL(req.url, 'http://local').pathname) || 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
    res.end(fs.readFileSync(file));
  });
  let browser, desktop;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const options = { headless: true };
    if (process.env.UI_BROWSER_PATH) options.executablePath = process.env.UI_BROWSER_PATH;
    // Chromium is only a test renderer with synthetic data and no Electron filesystem bridge.
    if (process.platform === 'linux') options.args = ['--no-sandbox'];
    let page;
    if (process.argv.includes('--electron')) {
      desktop = await _electron.launch({ args: [path.join(__dirname, 'electron-entry.cjs')], env: { ...process.env, ISLETMEM_TEST_DATA: dir } });
      page = await desktop.firstWindow();
      Object.defineProperty(store, 'data', { get: () => new Store(store.file).data });
    } else {
      browser = await chromium.launch(options);
      page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
    }
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    if (!desktop) await page.exposeFunction('bridge', ({ op, kind, input, id }) => {
      try { return { ok: true, data: op === 'read' ? store.data : op === 'add' ? store.add(kind, input) : op === 'update' ? store.update(kind, id, input) : store.remove(kind, id) }; }
      catch (e) { return { ok: false, error: e.message }; }
    });
    if (!desktop) await page.addInitScript(() => { window.accounting = {
      read: () => window.bridge({ op: 'read' }),
      add: (kind, input) => window.bridge({ op: 'add', kind, input }),
      update: (kind, id, input) => window.bridge({ op: 'update', kind, id, input }),
      remove: (kind, id) => window.bridge({ op: 'remove', kind, id }),
      backup: async () => ({ ok: true, data: null }), print: async () => ({ ok: true })
    }; });
    if (!desktop) await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    const nav = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    const dlg = page.getByRole('dialog');
    const save = async name => { await dlg.getByRole('button', { name, exact: true }).click(); await dlg.waitFor({ state: 'hidden' }); };
    await nav('▣ Kasa & banka'); await page.getByRole('button', { name: '+ Yeni hesap', exact: true }).click();
    await dlg.getByLabel('Hesap adı').fill('Ana kasa'); await save('Kaydet');
    await nav('▦ Ürün & stok'); await page.getByRole('button', { name: '+ Yeni ürün', exact: true }).click();
    await dlg.getByLabel('Ürün kodu').fill('UR-001'); await dlg.getByLabel('Ürün adı').fill('Çalışma masası');
    await dlg.getByLabel('KDV hariç alış fiyatı').fill('50'); await dlg.getByLabel('KDV hariç satış fiyatı').fill('100');
    await dlg.getByLabel('Açılış stok miktarı').fill('10'); await save('Kaydet');
    await nav('◎ Cari hesaplar'); await page.getByRole('button', { name: '+ Yeni cari', exact: true }).click();
    await dlg.getByLabel('Cari kodu').fill('CR-001'); await dlg.getByLabel('Cari unvanı').fill('Ada Ticaret');
    await dlg.getByLabel('Telefon', { exact: true }).fill('0532 000 00 00'); await save('Cari hesabı oluştur');
    await page.getByRole('button', { name: 'Ada Ticaret', exact: true }).click();
    await page.getByRole('tab', { name: 'Hesap ekstresi' }).waitFor();
    await page.getByRole('button', { name: '+ Satış faturası', exact: true }).click();
    await dlg.getByLabel('Satır ürünü').selectOption({ label: 'UR-001 · Çalışma masası (Adet)' });
    await dlg.getByLabel('Miktar', { exact: true }).fill('2');
    await dlg.getByLabel('Fatura tarihi').fill('2020-01-01'); await dlg.getByLabel('Vade tarihi').fill('2020-01-02');
    await dlg.getByRole('button', { name: '+ Ürün satırı ekle' }).click();
    const second = dlg.locator('.invoice-line').nth(1);
    await second.getByLabel('Satır ürünü').selectOption({ label: 'UR-001 · Çalışma masası (Adet)' });
    await second.getByLabel('Miktar', { exact: true }).fill('0,5'); await second.getByLabel('İskonto oranı').fill('10');
    await save('Faturayı kaydet');
    const c = store.data.contacts[0], p = store.data.products[0], i = store.data.invoices[0];
    assert.equal(i.amount, 29400); assert.equal(D.balance(store.data, c.id), 29400); assert.equal(D.stock(store.data, p.id), 7500);
    await page.getByRole('button', { name: 'Faturayı aç', exact: true }).click();
    await dlg.getByRole('button', { name: 'Tahsilat al', exact: true }).click();
    await dlg.getByLabel('Kasa / banka').selectOption({ label: 'Ana kasa' }); await dlg.getByLabel('Tutar (₺)').fill('100');
    await save('Hareketi kaydet');
    assert.equal(D.balance(store.data, c.id), 19400); assert.equal(D.paid(store.data, i.id), 10000);
    await page.getByRole('tab', { name: 'Faturalar', exact: true }).click();
    await page.getByText('Vadesi geçti', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Aç', exact: true }).click();
    await dlg.getByRole('button', { name: 'Tahsilat al', exact: true }).click();
    await dlg.getByLabel('Kasa / banka').selectOption({ label: 'Ana kasa' }); await dlg.getByLabel('Tutar (₺)').fill('195');
    await dlg.getByRole('button', { name: 'Hareketi kaydet', exact: true }).click();
    await dlg.getByRole('alert').getByText(/kalan bakiyesini aşıyor/).waitFor();
    await dlg.getByLabel('Tutar (₺)').fill('194'); await save('Hareketi kaydet');
    await page.getByText('Kapandı', { exact: true }).waitFor(); assert.equal(D.balance(store.data, c.id), 0);
    await page.getByRole('tab', { name: 'Tahsilat & ödeme', exact: true }).click();
    await page.getByRole('button', { name: 'Düzenle', exact: true }).first().click();
    await dlg.getByLabel('Açıklama').fill('Düzenlenmiş tahsilat'); await save('Hareketi kaydet');
    assert.equal(D.balance(store.data, c.id), 0); assert.equal(D.paid(store.data, i.id), 29400);
    await nav('◫ Genel bakış'); await page.getByRole('heading', { name: 'Genel bakış', exact: true }).waitFor();
    await nav('◎ Cari hesaplar'); await page.getByRole('button', { name: 'Ada Ticaret', exact: true }).click();
    await page.getByRole('tab', { name: 'Cari bilgileri', exact: true }).click();
    await page.getByRole('button', { name: 'Cari bilgilerini düzenle' }).click();
    await dlg.getByLabel('Cari unvanı').fill('Ada Ticaret A.Ş.'); await save('Değişiklikleri kaydet');
    assert.equal(store.data.contacts[0].name, 'Ada Ticaret A.Ş.');
    await nav('◎ Cari hesaplar'); await page.getByRole('button', { name: '+ Yeni cari', exact: true }).click();
    await dlg.getByLabel('Cari unvanı').fill('Mavi Tedarik'); await dlg.getByLabel('Cari türü').selectOption('supplier'); await save('Cari hesabı oluştur');
    await page.getByRole('button', { name: 'Mavi Tedarik', exact: true }).click();
    await page.getByRole('button', { name: '+ Alış faturası', exact: true }).click();
    await dlg.getByLabel('Satır ürünü').selectOption({ label: 'UR-001 · Çalışma masası (Adet)' });
    await dlg.getByLabel('Miktar', { exact: true }).fill('5'); await save('Faturayı kaydet');
    const supplier = store.data.contacts[1]; assert.equal(D.balance(store.data, supplier.id), -30000); assert.equal(D.stock(store.data, p.id), 12500);
    await page.getByRole('button', { name: '↑ Ödeme yap', exact: true }).click();
    await dlg.getByLabel('Kasa / banka').selectOption({ label: 'Ana kasa' }); await dlg.getByLabel('Tutar (₺)').fill('100');
    await dlg.getByLabel('Açıklama').fill('Avans ödeme'); await save('Hareketi kaydet');
    assert.equal(D.balance(store.data, supplier.id), -20000);
    await page.getByRole('tab', { name: 'Hesap ekstresi' }).click();
    await page.screenshot({ path: path.join(dir, 'cari-ekstresi.png'), fullPage: true });
    if (process.env.UI_SCREENSHOT_PATH) fs.copyFileSync(path.join(dir, 'cari-ekstresi.png'), process.env.UI_SCREENSHOT_PATH);
    await page.reload(); await nav('◎ Cari hesaplar');
    await page.getByRole('searchbox', { name: 'Kayıtlarda ara' }).fill('Ada');
    await page.getByRole('button', { name: 'Ada Ticaret A.Ş.', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Mavi Tedarik', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Ada Ticaret A.Ş.', exact: true }).click();
    await page.getByRole('tab', { name: 'Tahsilat & ödeme', exact: true }).click();
    assert.equal(await page.getByRole('cell', { name: 'Ana kasa', exact: true }).count(), 2);
    assert.equal(new Store(store.file).data.invoices.length, 2);
    assert.deepEqual(errors, []);
    console.log((desktop ? 'ELECTRON' : 'BROWSER') + ' UI PASS: cari açma/düzenleme/arama, çok satırlı iskonto+KDV, satış/alış stokları, kısmi/tam tahsilat, fazla ödeme engeli, tedarikçi ödeme, ekstre ve yeniden açılış.');
  } finally {
    if (desktop) await desktop.close();
    if (browser) await browser.close(); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
