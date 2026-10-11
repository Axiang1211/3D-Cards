#!/usr/bin/env node
/**
 * Add a card made in the browser to the public gallery.
 *
 *   node scripts/add-card.mjs path/to/my-card.holocard.json [--id my-card]
 *
 * 1. Extracts the photo (and foreground) from the card file into public/gallery/
 * 2. Appends the card to public/gallery/gallery.js
 * Commit and push, and the card appears in the gallery for every visitor.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const galleryDir = path.join(root, "public", "gallery");
const galleryJs = path.join(galleryDir, "gallery.js");

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const idFlag = args.indexOf("--id");
if (!file) fail("請指定卡片檔，例如：node scripts/add-card.mjs my-card.holocard.json");
if (!fs.existsSync(file)) fail("找不到檔案：" + file);

let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("這個檔案不是有效的 JSON。");
}
if (data.format !== "holo-card" || !data.card || !data.card.image) fail("這個檔案不是卡片檔（.holocard.json）。");
const card = data.card;

const src = fs.readFileSync(galleryJs, "utf8");
const marker = "window.HC_GALLERY = ";
const start = src.indexOf(marker);
const end = src.lastIndexOf("];");
if (start < 0 || end < 0) fail("無法解析 public/gallery/gallery.js，請確認陣列仍是純 JSON。");
const head = src.slice(0, start + marker.length);
let list;
try {
  list = JSON.parse(src.slice(start + marker.length, end + 1));
} catch {
  fail("public/gallery/gallery.js 裡的陣列不是有效的 JSON。");
}

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
// An id made only of digits (from a Chinese title, say) is useless in a URL.
const readable = (s) => (/[a-z]/.test(s) && s.length >= 3 ? s : "");
let id = idFlag >= 0 ? slugify(args[idFlag + 1]) : readable(slugify(card.title)) || readable(slugify(card.subtitle));
if (!id) id = "card-" + String(list.length + 1).padStart(3, "0");
let unique = id;
for (let n = 2; list.some((c) => c.id === unique); n++) unique = `${id}-${n}`;
id = unique;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "image/avif": "avif" };
function writeImage(dataUrl, suffix) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) fail("卡片檔裡的圖片格式不正確。");
  const ext = EXT[m[1]];
  if (!ext) fail("不支援的圖片格式：" + m[1]);
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  const name = `${id}-${suffix}.${ext}`;
  fs.writeFileSync(path.join(galleryDir, name), buf);
  return { rel: "gallery/" + name, kb: Math.round(buf.length / 1024) };
}

const bg = writeImage(card.image, "bg");
const fg = card.fg ? writeImage(card.fg, "fg") : null;

const num = (v, d, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const entry = {
  id,
  title: card.title || "",
  subtitle: card.subtitle || "",
  serial: card.serial || "",
  image: bg.rel,
  fg: fg ? fg.rel : "",
  foil: card.foil || "rainbow",
  area: card.area || "full",
  frame: card.frame || "white",
  zoom: num(card.zoom, 1, 1, 4),
  posX: num(card.posX, 50, 0, 100),
  posY: num(card.posY, 50, 0, 100),
};
const extra = {
  bgBlur: [0, 0, 100], foilStrength: [100, 0, 200], foilScale: [100, 50, 200], foilHue: [0, 0, 360],
  fgZoom: [1, 0.5, 3], fgX: [0, -50, 50], fgY: [0, -50, 50], fgFoilStrength: [100, 0, 200], fgFoilHue: [0, 0, 360],
};
for (const [k, [d, lo, hi]] of Object.entries(extra)) {
  const v = num(card[k], d, lo, hi);
  if (v !== d) entry[k] = v;
}
if (card.fgFoil && card.fgFoil !== "none") entry.fgFoil = card.fgFoil;
if (card.showText === false) entry.showText = false;
list.push(entry);

fs.writeFileSync(galleryJs, head + JSON.stringify(list, null, 2).replace(/\n/g, "\n") + ";\n");

console.log(`✓ 已加入「${entry.title || id}」（id: ${id}）`);
console.log(`  ${bg.rel}  ${bg.kb} KB`);
if (fg) console.log(`  ${fg.rel}  ${fg.kb} KB`);
console.log("  網址：#/card/" + id);
console.log("  接著 git add、commit、push，部署完成後所有人都看得到。");
