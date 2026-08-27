# Demo script — PM viability check, 28 Aug 2026

Runs locally: `npm run dev`, then http://localhost:5173. No key, no internet, no backend.
Total runtime about 90 seconds. Rehearse it once before the meeting.

---

## Before you start

- [ ] `npm run dev` already running, browser already on the page, **on the hook screen**
- [ ] Browser at full screen, notifications off
- [ ] The scripted input copied to your clipboard (below) — don't type it live
- [ ] Know that the reveal is pre-written for this exact business

---

## The scripted input

> We're a two-person bakery in Bandra called Proof & Butter, custom celebration cakes, and right now every order comes through Instagram DMs.

Paste it. It matches `src/data/replay/demo.json`. Any other input still returns the bakery.

---

## The run

| Step | Action | What you say |
|---|---|---|
| 1 | Click **Start** | "This sits on the pricing page. It doesn't replace it — it's for the people who bounce." |
| 2 | Paste the input, press Enter | "One free-text box. No dropdowns. This is the part that needs a model." |
| 3 | Guess screen appears | *Say nothing. Let them read it.* |
| 4 | Click **That's us** | "It read the business back. That's the hook." |
| 5 | **Yes, emails and contacts** | "This question is here on evidence — import intent is the strongest retention signal in the persona data." |
| 6 | **Email and a site** | — |
| 7 | The reveal builds | *Say nothing until it finishes.* |
| 8 | After it lands | "Domain, mailboxes, drafted site — before they've paid or signed up for anything." |

**The one rule: don't talk over the reveal.** It takes about four seconds. Silence sells it.

---

## Questions you should expect

**"Isn't this the KR1 persona bullet we already have?"**
The honest answer is that you don't know yet, and this is the question you actually want answered
— it's the Ignite disqualification risk. Ask them directly. The distinction to draw: KR1 is
*post-signup onboarding personalisation*; this is *pre-purchase*, and it's generative rather than
a branching flow.

**"How is this different from Chatbot V2?"**
Chatbot V2 guides someone through a decision tree to complete a purchase. This produces
something — a domain, mailboxes, drafted copy — before any purchase exists.

**"What if the model hallucinates a price?"**
It can't. The model never sees pricing and never picks a plan; it returns a profile, and code
maps profile to plan. That's `plans.json` plus a rules table.

**"Aren't we chasing exactly the low-retention cohort the strategy says to stop chasing?"**
This is the strongest objection and it's worth conceding partly. Frame the tool as an intent
*qualifier*: it routes low-intent to free and high-intent to seat bundles and annual billing.
That maps to KR4 (quality of users acquired) and the M3 retention metric.

**"What's the evidence?"**
64% of orders cancelled in the 2023–24 persona data. The fields that best predict retention —
import behaviour, current mail client — are filled on about 13% of orders. And
`business_industry` has 5,318 distinct strings across 13,968 rows, including "Pizza" and
"purchase". Neo can't currently act on those fields. **Caveat honestly: these are 2023–24
numbers from an older product state. Directional, not current.**

---

## What to say about what's missing

Say it before they find it. It reads as judgement rather than as gaps:

- **Prices are blank** — deliberate, rather than showing a number I couldn't verify.
- **The CTA doesn't go anywhere** — the handoff into Neo's purchase flow is hackathon work.
- **The middle two screens are rough** — all the effort went into the reveal on purpose.
- **This runs off a saved response, not a live model call** — the live path is built and works;
  the demo uses a recorded one so it can't fail on venue wifi.

---

## The actual ask

You are not asking "is this good". You are asking:

1. **Does this collide with anything already in design or PM phase?** (The disqualification risk.)
2. **Is this worth building at Ignite, 2–4 Sep?**
3. **If it works, is there a route to shipping it** — or is it a hackathon piece only?
