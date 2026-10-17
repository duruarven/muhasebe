const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("./store");
const { createMobileServer } = require("./mobile-server");
const { hostedOptions } = require("./hosted-auth");
async function start(env = process.env) {
  const options = hostedOptions(env);
  const store = new Store(path.join(env.DATA_DIR, "muhasebe.json"));
  const service = createMobileServer(store, options);
  const backupDir = path.join(env.DATA_DIR, "backups");
  function backup() {
    if (!fs.existsSync(store.file)) return;
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const file = path.join(backupDir, `muhasebe-${new Date().toISOString().slice(0, 10)}.json`);
    if (!fs.existsSync(file)) fs.copyFileSync(store.file, file, fs.constants.COPYFILE_EXCL);
    const old = fs.readdirSync(backupDir).filter(name => /^muhasebe-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(0, -14);
    for (const name of old) fs.unlinkSync(path.join(backupDir, name));
  }
  backup();
  const timer = setInterval(() => { try { backup(); } catch (error) { console.error("Günlük yedek oluşturulamadı:", error.message); } }, 60 * 60 * 1000);
  timer.unref();
  await service.listen();
  console.log("İşletmem internet sürümü hazır:", options.origin);
  const shutdown = async () => { clearInterval(timer); await service.close(); };
  return { service, store, shutdown };
}
if (require.main === module) {
  start().then(({ shutdown }) => {
    let closing = false;
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => {
      if (closing) return; closing = true;
      await shutdown(); process.exit(0);
    });
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { start };
