#!/usr/bin/env node
/**
 * Lists the files the Windows, Mac and Android apps show (public/, the same files as
 * desktop/copy-web.js) with their SHA-256 in public/app-update.json.
 *
 * Installed apps read this list from the website and download the files that changed,
 * so small updates reach them without a new release. Runs on every deploy (the "build"
 * command in wrangler.jsonc); the file is not committed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The oldest app that can run the website as it is now. Raise it to the new app version
 * when the website starts using something only a new app has (a new Rust command, a new
 * permission): older apps then keep their files until they are updated from the Releases page.
 */
const MIN_APP = "1.4.0";

// Same as desktop/copy-web.js, plus this list itself.
const SKIP = new Set(["_headers", "_redirects", "404.html", "models", "app-update.json"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else files[path.relative(root, full).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
})(root);

const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
const version = crypto
  .createHash("sha256")
  .update(Object.entries(sorted).map(([p, h]) => p + " " + h).join("\n"))
  .digest("hex")
  .slice(0, 16);

fs.writeFileSync(path.join(root, "app-update.json"), JSON.stringify({ version, minApp: MIN_APP, files: sorted }, null, 1) + "\n");
console.log(`app-update.json: ${Object.keys(sorted).length} files, version ${version}`);
