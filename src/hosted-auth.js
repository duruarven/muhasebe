const { randomBytes, scryptSync, scrypt, timingSafeEqual } = require("node:crypto");
function hostedOptions(env = process.env) {
  const value = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
  let origin;
  try { origin = new URL(value); } catch { throw Error("APP_ORIGIN: uygulamanın https:// ile başlayan internet adresini girin."); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw Error("APP_ORIGIN yalnızca HTTPS site adresi olmalı.");
  if (typeof env.APP_PASSWORD !== "string" || env.APP_PASSWORD.length < 16 || env.APP_PASSWORD.length > 256)
    throw Error("APP_PASSWORD 16–256 karakter uzunluğunda olmalı.");
  if (!env.DATA_DIR || !require("node:path").isAbsolute(env.DATA_DIR))
    throw Error("DATA_DIR kalıcı diskteki mutlak bir klasör yolu olmalı.");
  const salt = randomBytes(16), hash = scryptSync(env.APP_PASSWORD, salt, 64);
  return {
    hosted: true, origin: origin.origin, cookieName: "__Host-isletmem", secureCookie: true,
    authenticate: input => new Promise(resolve => {
      if (typeof input !== "string" || input.length > 256) return resolve(false);
      scrypt(input, salt, 64, (error, actual) => resolve(!error && timingSafeEqual(actual, hash)));
    }),
    port: Number(env.PORT || 3000),
    host: "0.0.0.0",
  };
}
module.exports = { hostedOptions };
