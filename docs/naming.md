# Naming

## Shipped name: **Find My Neo**

Decided 27 Aug 2026. This is what appears in demo-visible copy, the deck, and the page title.

Defined once in `src/lib/brand.ts` as `PRODUCT_NAME`. Never hardcode the string in a component —
if the PM team wants a different name after the review, that has to be a one-line change, not a
find-and-replace through UI copy under an Ignite deadline.

## "Akinator" — internal shorthand only

The name is a trademark of Elokence SAS. It is fine in conversation, in the repo name, in commit
messages, and in these docs. It must **never** appear in:

- anything rendered on screen
- the pitch deck or demo script
- the deployed page `<title>`
- a public URL

**Update 31 Aug: the repo was renamed to `find-my-neo`.** The earlier reasoning — that renaming
a remote mid-project breaks clones for no benefit — was outweighed once the link went public:
a trademarked name in a public repo URL is exactly the exposure this file exists to prevent.
GitHub redirects the old URL, so existing clones keep working; run
`git remote set-url origin https://github.com/THR1212/find-my-neo.git` to stop relying on that.

The local folder is still `Projects/neo-akinator`, which is harmless — nobody outside sees it.

**Update 04 Sep: the Vercel alias `neo-akinator.vercel.app` is still live and still resolves.**
This file's own list says a public URL must never carry the name, and that one does — it was
missed when the repo was renamed, because a Vercel project alias is derived from the original
folder name and does not follow a GitHub rename.

It is not a leak in the deployed page (the `<title>` and all on-screen copy are clean), but it
is visible in the address bar, which during a demo is on a projector in front of judges.

**Demo on `find-my-neo-hari-7720.vercel.app`** — same project, same deployment, same build hash,
no trademark in the URL. The bookmarklet already points there. The clean fix is a
`find-my-neo.vercel.app` alias in the Vercel dashboard (unclaimed as of 04 Sep); until someone
adds it, use the `-hari-7720` host and do not present from the `neo-akinator` one.

## Why "Find My Neo" works

- Says what it does without needing a tagline.
- Reads as a Neo product feature rather than a bolted-on hackathon toy, which matters when the
  pitch is "this should ship", not "look what we built in 48 hours".
- Survives the strategic counter-argument. The tool is an intent *qualifier* — the name frames
  it as helping a user find their fit, not as acquiring more low-intent signups.

## If it needs to change

Alternatives considered, kept here so the conversation doesn't restart from zero:
descriptive — *Neo Setup Finder*, *Neo Match*; with more character — *Hunch*, *Second Guess*,
*Read the Room*. The character-forward options are more memorable in a pitch but riskier with a
conservative naming review.
