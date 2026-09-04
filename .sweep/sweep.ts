import { QUESTIONS } from "../src/lib/questions";
import { recommend } from "../src/lib/rules";
import type { Profile } from "../src/lib/profile";

/* Enumerate the ANSWER SPACE directly rather than walking the engine: what we want to know is
   which plan combinations a person can actually land on, and that is a function of the profile,
   not of the order the questions arrived in. Each question contributes one option or "never
   asked" (undefined), which is a real state — the engine stops early. */
const qs = QUESTIONS.map((q) => ({
  id: q.id,
  askOnly: q.askOnly,
  choices: [undefined, ...q.options.map((o) => o.resolves)],
}));

const combos = new Map<string, { n: number; ex: string }>();
const needsSeen = new Map<string, number>();
let total = 0, skipped = 0;

function build(i: number, profile: Profile, trail: string[]) {
  if (i === qs.length) {
    total++;
    for (const boxes of [1, 2, 4, 8]) {
      const rec = recommend(profile, boxes, null);
      const key = `${rec.mailPlan.id} + ${rec.sitePlan?.id ?? "no site"}`;
      const e = combos.get(key) ?? { n: 0, ex: "" };
      e.n++;
      if (!e.ex) e.ex = `${trail.join(", ") || "(nothing answered)"} @${boxes}mbx = ₹${rec.monthlyInr}/mo`;
      combos.set(key, e);
      for (const nd of rec.needs) needsSeen.set(nd.id, (needsSeen.get(nd.id) ?? 0) + 1);
    }
    return;
  }
  const q = qs[i];
  for (const choice of q.choices) {
    if (choice !== undefined && q.askOnly && !q.askOnly(profile)) { skipped++; continue; }
    build(i + 1, choice === undefined ? profile : { ...profile, ...choice },
          choice === undefined ? trail : [...trail, q.id]);
  }
}
build(0, {} as Profile, []);

console.log(`profiles enumerated: ${total}  (gate-blocked branches: ${skipped})`);
console.log(`\nPLAN COMBINATIONS REACHABLE  (${combos.size} of 9)`);
const order = ["starter","standard","max"], sorder=["no site","basic","plus","growth"];
const all: string[] = [];
for (const m of order) for (const s of sorder) all.push(`${m} + ${s}`);
for (const k of all) {
  const v = combos.get(k);
  console.log(`  ${v ? "REACHED " : "MISSING "} ${k.padEnd(22)} ${v ? String(v.n).padStart(7) : "      -"}`);
}
console.log("\nExample path per combination:");
for (const k of all) { const v = combos.get(k); if (v) console.log(`  ${k.padEnd(22)} ${v.ex}`); }
console.log("\nNEEDS EXERCISED:");
for (const [k,v] of [...needsSeen.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${k.padEnd(28)} ${v}`);
