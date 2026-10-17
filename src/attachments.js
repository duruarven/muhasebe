const { randomUUID } = require("node:crypto");
const path = require("node:path");
const LIMIT = 2 * 1024 * 1024;
function normalizeAttachments(input = []) {
  if (!Array.isArray(input) || input.length > 5)
    throw Error("En fazla 5 ek belge ekleyin (belge başına 2 MB).");
  return input.map((file) => {
    if (
      !file ||
      typeof file.name !== "string" ||
      !file.name ||
      file.name.length > 200 ||
      /[/\\\0]/.test(file.name)
    )
      throw Error("Ek belge adı geçersiz.");
    if (
      typeof file.base64 !== "string" ||
      file.base64.length > Math.ceil(LIMIT / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)
    )
      throw Error("Ek belge geçersiz veya 2 MB sınırını aşıyor.");
    const bytes = Buffer.from(file.base64, "base64");
    if (
      !bytes.length ||
      bytes.length > LIMIT ||
      bytes.toString("base64") !== file.base64
    )
      throw Error("Ek belge içeriği geçersiz.");
    const ext = path.extname(file.name).toLowerCase();
    const valid =
      ext === ".pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : ext === ".png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : [".jpg", ".jpeg"].includes(ext) &&
            bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if (!valid) throw Error("Yalnızca geçerli PDF, PNG veya JPEG eklenebilir.");
    return {
      id: randomUUID(),
      name: file.name,
      base64: bytes.toString("base64"),
      size: bytes.length,
    };
  });
}
module.exports = { normalizeAttachments, LIMIT };
