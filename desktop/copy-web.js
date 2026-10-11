// Copies the website (../public) into desktop/web before packaging.
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "public");
const dest = path.join(__dirname, "web");
const skip = new Set(["_headers", "_redirects", "404.html"]);

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (file) => !skip.has(path.basename(file)),
});
console.log("Copied website into", dest);
