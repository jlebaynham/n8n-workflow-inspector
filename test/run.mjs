import fs from "node:fs";
import { normaliseWorkflow, walkWorkflow } from "../extension/lib/walk.js";
import { scanWorkflow, summarise } from "../extension/lib/scan.js";
import { cleanWorkflow } from "../extension/lib/clean.js";
const file = process.argv[2];
const { workflow, note } = normaliseWorkflow(JSON.parse(fs.readFileSync(file, "utf8")));
const w = walkWorkflow(workflow);
console.log("NOTE:", note);
console.log("OVERVIEW:", JSON.stringify(w.overview, null, 1));
for (const s of w.steps) {
  console.log(`${s.step}. ${s.name} — ${s.text}${s.disabled ? " [off]" : ""}`);
  for (const a of s.attached) console.log(`     + ${a.label}: ${a.name} — ${a.text}`);
  for (const n of s.next) console.log(`     ${n.label} → ${n.targets.map(t => `${t.step}:${t.name}`).join(", ")}`);
}
console.log("UNCONNECTED:", w.unconnected);
console.log("NOTES:", w.notes.length);
const f = scanWorkflow(workflow);
console.log("SCAN:", summarise(f));
for (const x of f) console.log(` [${x.severity}] ${x.title} | ${x.where} | ${x.field} | ${x.preview}`);
const c = cleanWorkflow(workflow, { emails: true, phones: true, picks: true });
console.log("CLEAN CHANGES:", c.changes);
const f2 = scanWorkflow(c.workflow);
console.log("RESCAN:", summarise(f2));
for (const x of f2) console.log(` [${x.severity}] ${x.title} | ${x.where} | ${x.field} | ${x.preview}`);
