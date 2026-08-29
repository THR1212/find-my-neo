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

The repo is private and stays named `neo-akinator` because renaming a remote mid-project breaks
clones and CI for no benefit. That is a deliberate exception, not an oversight.

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
