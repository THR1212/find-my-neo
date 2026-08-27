# Agent instructions

Read **`CLAUDE.md`** first — it holds the project invariants, the current state, and what to
build next. Then **`TECHNICAL.md`** for verified API facts and the gotchas.

This file exists so agent tools that look for `AGENTS.md` (Antigravity, Codex, Cursor and
others) land in the same place as the ones that look for `CLAUDE.md`. The two files are not
duplicated on purpose — `CLAUDE.md` is the single source of truth, and it stays that way
regardless of which tool is driving.

Three things worth knowing before you touch anything:

- `docs/handoff.md` is background from an exploratory chat. Much of it is unverified and some
  is stale. It is a lead list, not a spec. `CLAUDE.md` wins on any conflict.
- The LLM is **GPT-5.6, not Claude**. See `TECHNICAL.md` for the three parameter gotchas.
- There are two milestones with very different scopes — a lightweight PM demo on 28 Aug, and
  the Ignite hackathon build on 02–04 Sep. Check which one you are building for before you
  add anything.
