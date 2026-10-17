const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const D = require("./domain");
const { normalizeAttachments } = require("./attachments");
const ASSETS = ["index.html", "style.css", "sales-editor.css", "mobile.css", "domain.js", "sales-editor.js", "renderer.js", "web-bridge.js", "login.html", "login.js", "login.css"];
const equal = (a, b) => typeof a === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function createMobileServer(store, options = {}) {
  const code = randomBytes(16).toString("hex"), sessions = new Set(), attempts = new Map();
  const src = __dirname;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, "http://local");
      if (!['GET', 'POST'].includes(req.method)) return json(405, { ok: false, error: "Yöntem desteklenmiyor." });
      const cookie = /(?:^|;\s*)isletmem=([^;]*)/.exec(req.headers.cookie || "")?.[1];
      const authorized = sessions.has(cookie);
      if (req.method === "POST") {
        // JSON-only requests plus exact origin validation prevent cross-site writes/login.
        if (req.headers["content-type"] !== "application/json" || req.headers.origin !== `http://${req.headers.host}`)
          return json(403, { ok: false, error: "İstek kaynağı geçersiz." });
        let bytes = 0; const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16 * 1024 * 1024) return json(413, { ok: false, error: "İstek çok büyük." });
          chunks.push(chunk);
        }
        const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (url.pathname === "/api/login") {
          const key = req.socket.remoteAddress, now = Date.now();
          const record = attempts.get(key) || { count: 0, until: now + 60000 };
          if (now > record.until) { record.count = 0; record.until = now + 60000; }
          attempts.set(key, record);
          if (++record.count > 10) return json(429, { ok: false, error: "Çok fazla deneme. Bir dakika bekleyin." });
          if (!equal(input.code, code)) return json(401, { ok: false, error: "Erişim kodu yanlış veya süresi dolmuş." });
          if (sessions.size > 100) return json(429, { ok: false, error: "Oturum sınırı aşıldı. Mobil erişimi yeniden başlatın." });
          const session = randomBytes(32).toString("hex"); sessions.add(session);
          res.setHeader("Set-Cookie", `isletmem=${session}; HttpOnly; SameSite=Strict; Path=/`);
          return json(200, { ok: true });
        }
        if (!authorized) return json(401, { ok: false, error: "Oturum kapalı. Yeniden giriş yapın." });
        let result;
        if (url.pathname === "/api/add") result = store.add(input.kind, input.input);
        else if (url.pathname === "/api/update") result = store.update(input.kind, input.id, input.input);
        else if (url.pathname === "/api/remove") result = store.remove(input.kind, input.id);
        else if (url.pathname === "/api/logout") { sessions.delete(cookie); res.setHeader("Set-Cookie", "isletmem=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/"); }
        else return json(404, { ok: false, error: "İşlem bulunamadı." });
        return json(200, { ok: true, data: result });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!authorized) return json(401, { ok: false, error: "Oturum kapalı. Yeniden giriş yapın." });
        if (url.pathname === "/api/read") return json(200, { ok: true, data: store.data });
        if (url.pathname === "/api/backup") {
          res.writeHead(200, { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="muhasebe-yedek.json"' });
          return res.end(JSON.stringify(store.data, null, 2));
        }
        if (url.pathname === "/api/ledger") {
          store.contact(url.searchParams.get("contactId"));
          res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="cari-ekstresi.csv"' });
          return res.end(D.ledgerCsv(store.data, url.searchParams.get("contactId"), JSON.parse(url.searchParams.get("filters") || "{}")));
        }
        if (url.pathname === "/api/attachment") {
          const invoice = store.data.invoices.find(i => i.id === url.searchParams.get("invoiceId"));
          const attachment = invoice?.attachments?.find(a => a.id === url.searchParams.get("attachmentId"));
          if (!attachment) return json(404, { ok: false, error: "Belge bulunamadı." });
          const [checked] = normalizeAttachments([attachment]);
          res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(checked.name)}` });
          return res.end(Buffer.from(checked.base64, "base64"));
        }
        return json(404, { ok: false, error: "İşlem bulunamadı." });
      }
      let asset = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (asset === "index.html" && !authorized) asset = "login.html";
      if (!ASSETS.includes(asset) && !/^icons\/[a-z-]+\.svg$/.test(asset)) { res.writeHead(404).end(); return; }
      const file = path.join(src, asset);
      if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
      let body = fs.readFileSync(file);
      if (asset === "index.html") body = body.toString().replace('<script src="domain.js">', '<script src="web-bridge.js"></script><script src="domain.js">').replace('Veriler bu bilgisayarda saklanır', 'Canlı bağlantı · Veriler bilgisayarda saklanır');
      res.writeHead(200, { "Content-Type": ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" })[path.extname(asset)] });
      res.end(body);
    } catch (e) { if (!res.headersSent) json(400, { ok: false, error: e.message }); else res.end(); }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.maxConnections = 30;
  return { server, code, listen: () => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host || "0.0.0.0", () => { server.removeListener("error", reject); resolve(server.address().port); });
  }), close: () => { sessions.clear(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
module.exports = { createMobileServer };
