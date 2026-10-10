// Runs the extension's own secret patterns over every file that would be published.
import fs from "node:fs";
import path from "node:path";
import { findInString } from "../extension/lib/scan.js";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const skip = new Set([".git", "test/out", "dist", "node_modules", "__pycache__"]);
let bad = 0;
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const rel = path.relative(root, p);
    if (skip.has(rel) || skip.has(f)) continue;
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.(png|zip)$/.test(f)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const h of findInString(text)) {
      if (h.secret || h.kind === "email" || h.kind === "phone") {
        console.log(`${rel}: ${h.kind} ${h.value.slice(0, 12)}…`);
        if (h.secret) bad++;
      }
    }
  }
}
walk(root);
console.log(bad ? `SELF-SCAN: ${bad} secret-like strings` : "SELF-SCAN CLEAN (no secret-like strings)");
process.exit(bad ? 1 : 0);
