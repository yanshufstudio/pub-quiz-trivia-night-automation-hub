/**
 * ACC7 — reads the per-run JSON files the accuracy harness wrote and reports,
 * per generator: failures by type, retries, short or damaged packs,
 * placeholder answers, duplicate questions (within a pack and across repeats
 * of one brief), cost and time per pack, and the checker's fixes and drops.
 *
 * Usage: npx tsx scripts/acc7-analyse.ts <run folder> [<run folder> ...]
 * Prints markdown to stdout.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Q = { id: string; round: string; text: string; answer: string; options?: string[] };
type Run = {
  generator: string;
  brief: { id: string; run: string; prompt: string; expect?: number[] };
  failed?: string;
  errorName?: string | null;
  attempts?: number | null;
  retryWarnings?: string[];
  costUsd?: number;
  ms?: number;
  generation?: {
    attempts: number;
    truncated: boolean;
    droppedQuestions: number;
    droppedRounds: number;
    surplusQuestions: number;
    roundCounts?: number[];
    retryWarnings: string[];
    costUsd: number;
    ms: number;
  };
  before?: Q[];
  reviews?: {
    checker: string;
    costUsd: number;
    ms: number;
    failed?: string;
    fixed?: unknown[];
    dropped?: unknown[];
    unreviewed?: unknown[];
    roundCountsAfter?: number[];
    after?: Q[];
  }[];
};

const runs: Run[] = process.argv.slice(2).flatMap((dir) =>
  readdirSync(path.join(dir, "runs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, "runs", f), "utf8")) as Run)
);

/** An answer that stands in for one rather than being one. */
const PLACEHOLDER =
  /^(n\/?a|none|nil|null|undefined|not required|not applicable|no answer|tbd|tbc|todo|placeholder|unknown|answer|\?+|-+|—|–|\.+|x+|לא נדרש|לא רלוונטי|אין|אין תשובה|תשובה)$/i;
const PLACEHOLDER_TEXT = /\b(placeholder|lorem ipsum|todo|tbd)\b|\[(answer|question)\]/i;

function isPlaceholder(q: Q): string | null {
  const a = (q.answer ?? "").trim();
  if (a.length === 0) return "empty answer";
  if (PLACEHOLDER.test(a)) return `answer "${a}"`;
  if (PLACEHOLDER_TEXT.test(a) || PLACEHOLDER_TEXT.test(q.text)) return `placeholder wording`;
  if ((q.text ?? "").trim().length < 8) return `question text "${q.text}"`;
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function words(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / (a.size + b.size - inter || 1);
}
/** Same question: identical normalised text, or the same answer with most words shared. */
function duplicate(a: Q, b: Q): boolean {
  if (norm(a.text) === norm(b.text)) return true;
  return norm(a.answer) === norm(b.answer) && jaccard(words(a.text), words(b.text)) >= 0.5;
}

function pct(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const money = (n: number) => `$${n.toFixed(3)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const out: string[] = [];
for (const gen of [...new Set(runs.map((r) => r.generator))].sort()) {
  const mine = runs.filter((r) => r.generator === gen);
  const ok = mine.filter((r) => r.generation);
  const failed = mine.filter((r) => r.failed);

  // Cost and time per pack include the checker, and failed attempts too.
  const packCost = mine.map((r) => (r.generation?.costUsd ?? r.costUsd ?? 0) + (r.reviews ?? []).reduce((n, v) => n + v.costUsd, 0));
  const packMs = mine.map((r) => (r.generation?.ms ?? r.ms ?? 0) + (r.reviews ?? []).reduce((n, v) => n + v.ms, 0));
  const genMs = mine.map((r) => r.generation?.ms ?? r.ms ?? 0);

  const byType = new Map<string, number>();
  for (const r of failed) byType.set(r.errorName ?? "unknown", (byType.get(r.errorName ?? "unknown") ?? 0) + 1);

  out.push(`## ${gen}`, "");
  out.push(`- runs: ${mine.length}; packs returned: ${ok.length}; failed: ${failed.length}` +
    (failed.length ? ` (${[...byType].map(([k, v]) => `${k} ${v}`).join(", ")})` : ""));
  const retried = mine.filter((r) => (r.generation?.attempts ?? r.attempts ?? 1) > 1);
  out.push(`- ACC8 retries used: ${retried.length} (${retried.map((r) => `${r.brief.run}${r.failed ? " → failed" : " → ok"}`).join(", ") || "none"})`);
  out.push(`- spent: ${money(packCost.reduce((a, b) => a + b, 0))}`);
  out.push(`- cost per pack incl. C2: avg ${money(packCost.reduce((a, b) => a + b, 0) / mine.length)}, p90 ${money(pct(packCost, 90))}, max ${money(Math.max(...packCost))}`);
  out.push(`- time per pack incl. C2: avg ${secs(packMs.reduce((a, b) => a + b, 0) / mine.length)}, p90 ${secs(pct(packMs, 90))}, max ${secs(Math.max(...packMs))}`);
  out.push(`- generation time only: avg ${secs(genMs.reduce((a, b) => a + b, 0) / mine.length)}, p90 ${secs(pct(genMs, 90))}, max ${secs(Math.max(...genMs))}`);

  const c2 = ok.flatMap((r) => (r.reviews ?? []).filter((v) => !v.failed));
  const c2failed = ok.flatMap((r) => (r.reviews ?? []).filter((v) => v.failed).map((v) => `${r.brief.run}: ${v.failed}`));
  out.push(`- C2: ${c2.reduce((n, v) => n + (v.fixed?.length ?? 0), 0)} fixed, ${c2.reduce((n, v) => n + (v.dropped?.length ?? 0), 0)} dropped, ` +
    `${c2.reduce((n, v) => n + (v.unreviewed?.length ?? 0), 0)} unreviewed, over ${ok.reduce((n, r) => n + (r.before?.length ?? 0), 0)} questions; review failures ${c2failed.length}`);
  for (const f of c2failed) out.push(`  - review failed ${f}`);
  out.push("");

  out.push("### Failures", "");
  if (!failed.length) out.push("None.");
  for (const r of failed) {
    out.push(`- **${r.brief.run}** (${r.errorName}, attempts ${r.attempts ?? "?"}, ${money(r.costUsd ?? 0)}, ${secs(r.ms ?? 0)}): ${r.failed}`);
    for (const w of r.retryWarnings ?? []) out.push(`  - warning: ${w}`);
  }
  out.push("");

  out.push("### Short, damaged or retried packs", "");
  const damaged: string[] = [];
  for (const r of ok) {
    const g = r.generation!;
    const counts = g.roundCounts ?? [];
    const notes: string[] = [];
    if (g.attempts > 1) notes.push(`attempt ${g.attempts} (${g.retryWarnings.join(" / ")})`);
    else if (g.retryWarnings.length) notes.push(`warning: ${g.retryWarnings.join(" / ")}`);
    if (g.truncated) notes.push("truncated");
    if (g.droppedQuestions || g.droppedRounds) notes.push(`salvage dropped ${g.droppedQuestions} q / ${g.droppedRounds} rounds`);
    if (g.surplusQuestions) notes.push(`surplus ${g.surplusQuestions}`);
    const e = r.brief.expect;
    if (e) {
      if (counts.length !== e.length || counts.some((n, i) => n < e[i])) notes.push(`rounds ${JSON.stringify(counts)} vs asked ${JSON.stringify(e)}`);
      for (const v of r.reviews ?? []) {
        const after = v.roundCountsAfter;
        if (after && after.some((n, i) => n < (e[i] ?? 0))) notes.push(`after ${v.checker} drops: ${JSON.stringify(after)}`);
      }
    } else {
      notes.push(`(no count in brief) rounds ${JSON.stringify(counts)}`);
    }
    if (notes.length) damaged.push(`- ${r.brief.run}: ${notes.join("; ")}`);
  }
  out.push(...(damaged.length ? damaged : ["None."]), "");

  out.push("### Placeholder answers", "");
  const ph: string[] = [];
  for (const r of ok) {
    for (const q of r.before ?? []) {
      const why = isPlaceholder(q);
      if (why) ph.push(`- ${r.brief.run} ${q.id}: ${why} — Q: ${q.text} | A: ${q.answer}`);
    }
    for (const v of r.reviews ?? []) for (const q of v.after ?? []) {
      const why = isPlaceholder(q);
      if (why && !(r.before ?? []).some((b) => b.id === q.id && b.answer === q.answer)) ph.push(`- ${r.brief.run} ${q.id} after ${v.checker}: ${why} — A: ${q.answer}`);
    }
  }
  out.push(...(ph.length ? ph : ["None found by the pattern check (see the script for the pattern)."]), "");

  out.push("### Duplicate questions within a pack", "");
  const dupIn: string[] = [];
  for (const r of ok) {
    const qs = r.before ?? [];
    for (let i = 0; i < qs.length; i++)
      for (let j = i + 1; j < qs.length; j++)
        if (duplicate(qs[i], qs[j])) dupIn.push(`- ${r.brief.run} ${qs[i].id}/${qs[j].id}: "${qs[i].text}" (${qs[i].answer}) ~ "${qs[j].text}" (${qs[j].answer})`);
  }
  out.push(...(dupIn.length ? dupIn : ["None."]), "");

  out.push("### Repeats across runs of the same brief", "");
  out.push("| brief | packs | questions | repeated in another run of the brief | share |", "|---|---|---|---|---|");
  for (const id of [...new Set(ok.map((r) => r.brief.id))]) {
    const packs = ok.filter((r) => r.brief.id === id);
    if (packs.length < 2) continue;
    let total = 0;
    let repeated = 0;
    for (const p of packs) for (const q of p.before ?? []) {
      total++;
      if (packs.some((o) => o !== p && (o.before ?? []).some((x) => duplicate(q, x)))) repeated++;
    }
    out.push(`| ${id} | ${packs.length} | ${total} | ${repeated} | ${total ? Math.round((100 * repeated) / total) : 0}% |`);
  }
  out.push("");
}
console.log(out.join("\n"));
