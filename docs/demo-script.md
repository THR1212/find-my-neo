# Demo script — PM viability check, 28 Aug 2026

Runs locally: `npm run dev`, then http://localhost:5173. ~2 minutes.
Rehearse once. The reveal takes about five seconds and the urge to fill that silence is strong.

**Read this before anything else:** the framing changed on 27 Aug after walking Neo's live
`/ai-website-builder`. Do not present this as a new idea. Present it as a qualifier that feeds
the builder Neo already has. The overlap is the first thing a Neo PM will see — name it before
they do.

---

## Before you start

- [ ] `npm run dev` running, browser on the hook screen, full screen, notifications off
- [ ] `.env.local` has `DOMSCAN_API_KEY` (domain availability is a **live** call — if it fails
      the reveal still renders, just without live badges)
- [ ] Scripted input on your clipboard — paste it, don't type it live
- [ ] A second tab open on `neo.space/ai-website-builder`, already at the category step

---

## Open by naming the collision (30 seconds, before you demo anything)

> "Neo already has an AI website builder. You describe your business, it generates a site,
> offers a domain and email. I walked it this morning. So I'm not going to pretend this is a
> new idea — what I want to show you is the half of it I think is missing, and one thing I
> found in your live flow."

This costs you nothing and buys the whole meeting. If they spot the overlap first, you spend
the rest of the time defending; if you name it, you're the person who did the homework.

---

## The evidence, on their own product (60 seconds)

On the second tab, at Neo's category step:

1. Type **food** → *Food & Beverages*, *Food & Beverage E-commerce*… a real taxonomy.
2. Type **retail** → seven options. Also real.
3. Type **bakery** → **nothing matches.** It accepts the raw string as a custom entry.

> "That's live, right now. And it's the mechanism behind this: in the persona data, 13,968 rows
> produced **5,318 distinct `business_industry` values** — 'Pizza', 'ONLINE STORE', 'repair',
> 'purchase'. Case variants counted separately. Neo can't act on that field today."

**Be honest about the data:** it's the 2023–24 Athena pull, an older product state. The
*direction* holds; don't quote the levels as current.

---

## The demo (90 seconds)

| Step | Action | What you say |
|---|---|---|
| 1 | **Start** | "This opens over the pricing page. It doesn't replace it — it's for people who'd otherwise bounce." |
| 2 | Paste, Enter | "One free-text box. That's the difference from a category picker — 'bakery' works here." |
| 3 | Guess appears | *Say nothing. Let them read it.* |
| 4 | **That's us** | "It read the business back. Notice the counter — 5,318 possible setups down to about 1,600, from one sentence." |
| 5 | **Social DMs** | "The questions aren't fixed. It asked this because the text mentioned Instagram — a different business gets a different path." |
| 6 | **Emails and contacts** | "This one's on evidence: import intent is the strongest retention signal in the persona data." |
| 7 | **Email and a site** | — |
| 8 | Reveal builds | *Silence.* |
| 9 | After it lands | "Domain — checked live, that availability is a real lookup. Mailboxes. The drafted site. And two features picked for *them*, because they told us orders come through DMs." |
| 10 | **Claim it and start building** | "And this is the point — it hands into your builder. We don't build the site. You already do that." |

**The one rule: don't talk over the reveal.**

---

## The ask

Not "is this good". Three things:

1. **Does this collide with anything already in design or PM phase?** Specifically the KR1
   persona bullet in `NP/1697185794`. This is the Ignite disqualification risk and they'd know.
2. **Is the qualifier framing right** — persona → domain/mailbox/site plan → handoff?
3. **If it works, is there a route to shipping it,** or is it a hackathon piece only?

---

## Questions you should expect

**"How is this different from the builder?"**
The builder starts once someone has decided to build a site. This starts before they've decided
anything — it works out what they need, then routes them in with it pre-filled.

**"Isn't this Chatbot V2?"**
Chatbot V2 guides someone down a decision tree to complete a purchase. This produces something —
a domain, mailboxes, drafted copy — before a purchase exists.

**"What if the model hallucinates a price, or a feature?"**
It can't do either. The model returns a profile only. Plan selection is a rules table, domain
prices come from an API, and the feature highlights are a fixed bank of real Neo features
matched deterministically. Inventing a Neo feature is the one failure we designed out.

**"Are those real prices?"**
No, and say so plainly. They're third-party registrar list prices in USD converted at a fixed
rate — labelled "approx" on screen. The right source is Neo's own domain search API. **Availability
is genuinely live.**

**"Aren't we chasing the low-retention cohort the strategy says to stop chasing?"**
Concede part of it. Frame the tool as an intent *qualifier*: routes low-intent to free, high-intent
to seat bundles and annual billing. Maps to KR4 and the M3 retention metric.

---

## Say what's missing before they find it

- **Prices are indicative, not Neo's** — deliberate, rather than a number I couldn't verify.
- **The handoff isn't built.** The CTA is inert. Integrating with the builder is the next real work.
- **It runs off a recorded model response.** The live path exists; the demo uses a recorded one
  so it can't fail on venue wifi. Domain lookup *is* live.
- **Mailbox pricing isn't sourced.** Site plans are (₹269/₹359/₹899); mailbox plans aren't.
