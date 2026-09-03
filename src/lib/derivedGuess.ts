/**
 * A Guess-screen noun phrase built from the user's own words.
 *
 * Completes "You're …" on `Guess.tsx`. Used when the model cannot run — missing Preview
 * key, replay with no profile.json, a dead provider — so the screen still reflects THIS
 * description rather than going blank or, worse, showing the bakery fixture.
 *
 * Deliberately dumb: strip a first-person lead-in, keep their wording, stop at one
 * sentence. No industry taxonomy, no invented bakery.
 */

const MAX_LEN = 140;

/** Sentence-start leftovers we may lowercase. Real names stay capitalised. */
const SMALL = new Set([
  "a",
  "an",
  "the",
  "someone",
  "we",
  "i",
  "my",
  "our",
  "this",
  "it",
]);

/**
 * One noun phrase, or "" if the description has nothing usable.
 *
 * Kept free of Node/browser APIs so the Vite client and the profile service can share it.
 */
export function deriveGuessSummary(businessText: string): string {
  let text = businessText.trim().replace(/\s+/g, " ");
  if (!text) return "";

  const sentence = text.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentence) text = sentence[1];
  text = text.replace(/[.!?…]+$/u, "").trim();

  /* An em-dash often holds the useful clause first: "Sunrise Dental in Austin — walk-ins". */
  const dash = text.split(/\s+[—–-]\s+/)[0]?.trim() ?? text;
  if (dash.length >= 16) text = dash;

  text = stripLeadIn(text).trim();
  if (text.length < 8) return "";

  text = asNounPhrase(text);
  return clip(text, MAX_LEN);
}

function stripLeadIn(text: string): string {
  let next = text.replace(/^(?:it(?:'s| is)|this is)\s+/i, "");
  if (next !== text) return next;

  next = text.replace(/^(?:we(?:'re| are)|i(?:'m| am))\s+/i, "");
  if (next !== text) return next;

  next = text.replace(/^(?:we|i)\s+have\s+(?=a |an |the )/i, "");
  if (next !== text) return next;

  next = text.replace(/^(?:we|i)\s+(?:run|own|operate|started|opened)\s+/i, "");
  if (next !== text) return next;

  next = text.replace(/^(?:my|our)\s+/i, "");
  if (next !== text) return next;

  const verbLead = text.match(/^(?:i|we)\s+(\S+)\s+(.+)$/i);
  if (verbLead) return `someone who ${thirdPerson(verbLead[1])} ${verbLead[2]}`;

  return text;
}

function thirdPerson(verb: string): string {
  const v = verb.toLowerCase();
  if (/(?:s|x|z|ch|sh)$/.test(v)) return `${v}es`;
  if (/[^aeiou]y$/.test(v)) return `${v.slice(0, -1)}ies`;
  return `${v}s`;
}

function asNounPhrase(text: string): string {
  if (/^(?:a|an|the|someone)\b/i.test(text)) return decapLead(text);

  const first = text.split(/\s+/)[0] ?? "";
  if (/^[A-Z]/.test(first) && !SMALL.has(first.toLowerCase())) return text;

  const article = /^[aeiou]/i.test(text) ? "an" : "a";
  return `${article} ${decapLead(text)}`;
}

function decapLead(text: string): string {
  const first = text.split(/\s+/)[0] ?? "";
  if (!first || !SMALL.has(first.toLowerCase())) return text;
  return first.toLowerCase() + text.slice(first.length);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const comma = slice.lastIndexOf(",");
  const space = slice.lastIndexOf(" ");
  const at = comma >= 56 ? comma : space;
  return (at >= 40 ? slice.slice(0, at) : slice).trim();
}
