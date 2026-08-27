# Find My Neo

An adaptive quiz for Neo's pricing page. Someone describes their business in plain English;
it works out who they are and shows them a personalised setup — an available domain, their
mailboxes, a drafted site — before they pay for anything.

**This README assumes you don't write TypeScript.** It's a map, not a tutorial. Everything here
is "what this file does" and "what to do when X breaks", in plain English.

---

## Running it

```bash
npm install               # once, after cloning
cp .env.example .env.local  # then paste DOMSCAN_API_KEY into it
npm run dev               # open http://localhost:5173
```

To stop it: `Ctrl+C` in that terminal.

**What needs internet and what doesn't.** The AI part reads a saved answer from a file, so it
works offline and can't fail on venue wifi. The **domain availability and price** are a real
live lookup and need `DOMSCAN_API_KEY` in `.env.local`. Without the key the reveal still renders
— it just falls back to saved domains with no "Available" badge, and logs nothing to tell you why.
That's the failure you're most likely to hit on a fresh clone.

```bash
npm run build   # checks everything still compiles. Run before you commit.
```

If `npm run build` passes, the code is structurally sound. It won't tell you whether it *looks*
right — that still needs eyes.

---

## The demo script

1. Click **Start**
2. Type (or paste) the scripted input:
   > We're a two-person bakery in Bandra called Proof & Butter, custom celebration cakes, and right now every order comes through Instagram DMs.
3. Press Enter
4. **That's us** → **Yes, emails and contacts** → **Email and a site**
5. The reveal builds itself line by line. That's the moment. Let it finish; don't talk over it.

**The typed input and the saved answer must match.** The reveal is pre-written for *this* business.
Type something else and you'll still get the bakery — which is fine if you're expecting it and
very confusing if you're not. See "Changing the demo answer" below.

---

## What each file does

| File | In plain English |
|---|---|
| `src/data/replay/demo.json` | **The saved answer.** Business summary, domains, mailboxes, site copy. Edit this to change what the demo shows. Plain text — no code. |
| `src/lib/questions.ts` | **The question bank.** All the questions it can ask, and their options. Plain-ish — safe to reword. |
| `src/lib/engine.ts` | Picks which question to ask next, and works out the "possible setups" counter. |
| `src/lib/features.ts` | The "worth knowing" lines on the reveal. **Only add features listed in `docs/neo-product-facts.md`.** |
| `src/data/plans.json` | Plan names and prices. Prices are blank on purpose — see the file's own note. |
| `src/lib/brand.ts` | The product name and the hook line, in one place. |
| `src/lib/api.ts` | Decides whether to read the saved answer or call the real AI. |
| `src/lib/domains.ts` | Asks our own server for domain availability and price. |
| `api/_lib/domainService.ts` | Talks to DomScan. **Holds the API key — server-side only.** |
| `api/_lib/llm.ts` | Talks to the real AI. Not used by the demo. |
| `src/screens/*.tsx` | One file per screen: `Hook` → `Describe` → `Guess` → `AdaptiveQuestion` (repeats) → `Reveal`. |
| `src/App.tsx` | Wires it together and decides what comes next. |
| `src/index.css` | How it looks — colours, sizes, spacing, background. Uses Neo's real brand colours. |
| `vite.config.ts` | Also runs the `/api/domains` endpoint locally, so `npm run dev` behaves like the deployed version. |

Longer versions: `CLAUDE.md` (rules), `TECHNICAL.md` (API facts), `DECISIONS.md` (why things are
the way they are), `docs/neo-product-facts.md` (what Neo actually does — check before claiming).

## How the flow works now

It isn't a fixed set of screens any more. You describe your business, it guesses, then it asks
whichever question tells it the most — so two different businesses get two different question
paths. It stops when it's confident, or after four questions, whichever comes first.

The counter at the top starts at **5,318** (the real number of distinct industry values in Neo's
persona data) and collapses as you answer. That's the point of the whole thing — watching it
narrow.

---

## Changing the demo answer

Open `src/data/replay/demo.json`. It looks like this:

```json
"domain": { "name": "proofandbutter.com", "available": true },
"mailboxes": [
  { "address": "hello@proofandbutter.com", "label": "For enquiries and new customers" }
]
```

Change the text between the quote marks. Save. The browser updates by itself.

Three rules that will save you: keep every `"` and `,` exactly where they are, don't add a comma
after the *last* item in a list, and if the page goes blank you almost certainly broke one of
those two — undo (`Ctrl+Z`) and try again.

---

## When something breaks

**No "Available" badge, and no price on the domains.** The `DOMSCAN_API_KEY` is missing or wrong.
Check `.env.local` exists and has the line `DOMSCAN_API_KEY=dsk_...`. **You must restart
`npm run dev` after editing `.env.local`** — it's read once at startup. To confirm the key
itself works, open this in a browser while the server is running:
`http://localhost:5173/api/domains?name=testbakery&tlds=com,in,co`
You should get JSON with `"available"` and `"priceInr"`. If you get `{"error":"DOMSCAN_API_KEY is not set"}`,
the key isn't reaching the server.

**Blank white page.** You have a typo in a `.json` file. Press `F12` in the browser, click
**Console**, and read the red text — it names the file and line. Usually a missing comma or quote.

**"Port 5173 is already in use".** The server is still running in another terminal. Close it, or
just open the address it prints instead.

**Changes don't show up.** Hard-refresh: `Ctrl+Shift+R`. If that fails, stop the server
(`Ctrl+C`) and `npm run dev` again.

**`npm run build` fails with a wall of red.** The first error is the only one that matters — the
rest are usually knock-on. It names a file and a line number. Paste that first error into Claude
Code or Antigravity; don't try to read the whole wall.

**Something looks wrong but nothing is broken.** That's CSS, and it's all in `src/index.css`.
Describe what you see rather than guessing at the fix — "the buttons overlap on my phone" is
more useful than "change the padding".

**You want to undo everything since the last commit.** `git checkout -- .` — this throws away
uncommitted changes and cannot be undone. `git stash` does the same but keeps them recoverable.

---

## Things that are deliberately not finished

**Plan prices are blank.** `plans.json` has `priceInr: null`, so the plan name shows without a
price. Intentional — a wrong price in front of the Neo product team is worse than none.

**Domain prices say "approx" because they aren't Neo's.** They're a third-party registrar's USD
list price converted at a fixed rate. Availability *is* real. The right fix is Neo's own domain
search API.

**The CTA doesn't go anywhere.** Handing users into Neo's builder is the next real piece of work,
and it must stay a button a person clicks, never an automatic redirect.

---

## Don't

- Point this at `join-preprod.neo.space`. Preprod uses **live** Stripe keys.
- Create real orders, or run scripted traffic against Neo's production domain search.
- Ship the word "Akinator" anywhere a person can see it. It's a trademark. See `docs/naming.md`.
