const { chromium } = require("playwright-core");
const { start } = require("../src/web-server");
const { Store } = require("../src/store");
const D = require("../src/domain");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const https = require("node:https"), http = require("node:http"), { execFileSync } = require("node:child_process");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "isletmem-https-"));
  let instance, browser, proxy;
  try {
    const key = path.join(dir, "test.key"), cert = path.join(dir, "test.crt");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-days", "1", "-keyout", key, "-out", cert], { stdio: "ignore" });
    let targetPort;
    proxy = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
      const upstream = http.request({ hostname: "127.0.0.1", port: targetPort, path: req.url, method: req.method, headers: req.headers }, result => {
        res.writeHead(result.statusCode, result.headers); result.pipe(res);
      });
      upstream.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
    const origin = `https://127.0.0.1:${proxy.address().port}`;
    const env = { APP_ORIGIN: origin, APP_PASSWORD: "only-synthetic-test-password", DATA_DIR: path.join(dir, "cloud"), PORT: "0" };
    instance = await start(env); targetPort = instance.service.server.address().port;
    const source = new Store(path.join(dir, "desktop-backup.json"));
    source.add("contacts", { name: "Bulut müşteri", type: "customer", openingAmount: "1000", openingSide: "receivable" });
    source.add("accounts", { name: "Ortak kasa", type: "cash" });
    browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_PATH ? { executablePath: process.env.UI_BROWSER_PATH } : {}), ...(process.platform === "linux" ? { args: ["--no-sandbox"] } : {}) });
    const desktop = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 }, locale: "tr-TR" });
    const phone = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "tr-TR" });
    const pc = await desktop.newPage(), mobile = await phone.newPage(), errors = [];
    for (const page of [pc, mobile]) {
      page.setDefaultTimeout(12000); page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await page.getByLabel("Giriş şifresi").fill(env.APP_PASSWORD);
      await page.getByRole("button", { name: "Bağlan", exact: true }).click();
      await page.getByRole("heading", { name: "Genel bakış", exact: true }).waitFor();
    }
    const cookies = await phone.cookies();
    assert.equal(cookies.find(c => c.name === "__Host-isletmem").secure, true);
    await mobile.getByRole("button", { name: "Cari hesaplar", exact: true }).click();
    await pc.getByRole("button", { name: "Dosya", exact: true }).click();
    const chooser = pc.waitForEvent("filechooser");
    await pc.getByRole("menuitem", { name: "Masaüstü yedeğini aktar (boş sistem)", exact: true }).click();
    await (await chooser).setFiles(source.file);
    await pc.getByText("Yedek ortak sisteme aktarıldı.", { exact: true }).waitFor();
    await pc.getByRole("button", { name: "Cari hesaplar", exact: true }).click();
    await pc.getByRole("button", { name: "Bulut müşteri", exact: true }).click();
    await mobile.getByRole("button", { name: "Bulut müşteri", exact: true }).click();
    async function receive(amount) {
      await mobile.getByRole("button", { name: "↓ Tahsilat al", exact: true }).click();
      const dlg = mobile.getByRole("dialog");
      await dlg.getByLabel("Kasa / banka").selectOption({ label: "Ortak kasa" });
      await dlg.getByLabel("Tutar (₺)").fill(amount);
      await dlg.getByLabel("Açıklama", { exact: false }).fill("İnternetten tahsilat");
      await dlg.getByRole("button", { name: "Hareketi kaydet", exact: true }).click();
      await dlg.waitFor({ state: "hidden" });
    }
    await receive("300,01");
    await pc.locator(".balance-value").getByText("699,99", { exact: true }).waitFor();
    await desktop.close(); // The central Node server continues after the desktop client closes.
    await receive("100");
    assert.equal(await mobile.locator(".balance-value").textContent(), "599,99");
    assert.equal(D.balance(instance.store.data, source.data.contacts[0].id), 59999);
    await instance.shutdown(); instance = null;
    instance = await start(env); targetPort = instance.service.server.address().port;
    await mobile.reload();
    await mobile.getByLabel("Giriş şifresi").fill(env.APP_PASSWORD);
    await mobile.getByRole("button", { name: "Bağlan", exact: true }).click();
    await mobile.getByRole("button", { name: "Cari hesaplar", exact: true }).click();
    await mobile.getByRole("button", { name: "Bulut müşteri", exact: true }).click();
    assert.equal(await mobile.locator(".balance-value").textContent(), "599,99");
    assert.deepEqual(errors, []);
    console.log("HOSTED HTTPS UI PASS: güvenli çerezle iki cihazda giriş, masaüstü yedeği aktarımı, ortak tahsilat, bilgisayar tarayıcısı kapalıyken telefon işlemi ve sunucu yeniden başlayınca kayıtların korunması.");
  } finally {
    await browser?.close(); await instance?.shutdown();
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
