# Find My Neo

An adaptive quiz for Neo's pricing page. Someone describes their business in plain English;
it works out who they are and shows them a personalised setup — an available domain, their
mailboxes, a drafted site — before they pay for anything.

**This README assumes you don't write TypeScript.** It's a map, not a tutorial. Everything here
is "what this file does" and "what to do when X breaks", in plain English.

---

## Running it

```bash
npm install     # once, after cloning
npm run dev     # then open http://localhost:5173
```

That's the whole demo. No API key, no internet, no backend — it reads a saved answer from a file.

To stop it: `Ctrl+C` in that terminal.

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
| `src/data/replay/demo.json` | **The saved answer.** Domain, mailboxes, site copy. Edit this to change what the demo shows. It is plain text — no code. |
| `src/data/plans.json` | Plan names and prices. Prices are blank right now, so no price shows. |
| `src/lib/brand.ts` | The product name, in one place. |
| `src/lib/session.ts` | The list of screens, their order, and the answer options. |
| `src/lib/api.ts` | Decides whether to read the saved answer or call the real AI. |
| `src/screens/*.tsx` | One file per screen. `Hook` → `Describe` → `Guess` → `Import` → `Surface` → `Reveal`. |
| `src/App.tsx` | Wires the screens together and handles moving between them. |
| `src/index.css` | Everything about how it looks — colours, sizes, spacing, the background. |
| `api/_lib/llm.ts` | Talks to the real AI. **Not used by the demo.** For the hackathon build. |

Longer versions: `CLAUDE.md` (rules), `TECHNICAL.md` (API facts), `DECISIONS.md` (why things are
the way they are).

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

## Two things that are deliberately not finished

**Prices are blank.** `plans.json` has `priceInr: null`, so the plan name shows without a price.
That's intentional — a wrong price in front of the Neo product team is worse than none. Fill in
the real numbers and the price appears by itself.

**The "Claim this setup" button does nothing.** Handing users into Neo's real purchase flow is
hackathon work, and it must stay a button a person clicks, never an automatic redirect.

---

## Don't

- Point this at `join-preprod.neo.space`. Preprod uses **live** Stripe keys.
- Create real orders, or run scripted traffic against Neo's production domain search.
- Ship the word "Akinator" anywhere a person can see it. It's a trademark. See `docs/naming.md`.
