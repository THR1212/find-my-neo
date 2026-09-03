import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DomainOption, RevealContent } from "../lib/session";
import { availableFromLookup, lookupDomains, type DomainInfo } from "../lib/domains";
import { pickFeatures, withReason, type FeatureSurface, type ReasonMap } from "../lib/features";
import { recommend, CYCLE_LABEL } from "../lib/rules";
import { buildHandoffUrl } from "../lib/handoff";
import NeoSitePreview from "../components/NeoSitePreview";
import NeoSiteGenerating from "../components/NeoSiteGenerating";
import { block as blockData, type NeoSite } from "../lib/neoSite";
import type { Profile } from "../lib/engine";

/**
 * THE screen. Everything else exists to set it up.
 *
 * Line-by-line materialisation: domain, then mailboxes, then the drafted site, then the plan
 * quietly underneath. Each block lands on its own beat so it reads as the tool *working*
 * rather than a page that loaded.
 *
 * Rules that hold here:
 *  - Domain alternates are selectable and each carries its OWN price — TLDs are not priced
 *    alike, and picking the domain is the first real decision in the purchase.
 *  - Plan and price are shown quietly, last, and are never chosen by the model.
 *  - The CTA is a REAL link into Neo's funnel, carrying `bn`/`bd` as query params (their
 *    handoff needs no encoder). Always an <a> a person clicks, never a scripted redirect.
 */

const BEAT = 0.55;
const ease = [0.16, 1, 0.3, 1] as const;

const block = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export default function Reveal({
  reveal,
  loading,
  error,
  surface,
  mailboxCount: answeredMailboxes,
  profile,
  businessText,
  neoSite,
  reasons,
  onRestart,
}: {
  reveal: RevealContent | null;
  loading: boolean;
  error: string | null;
  surface: string | null;
  /**
   * Mailboxes the user actually asked for. Was `teamSize`, which stopped being the right
   * number once the question started asking for addresses rather than headcount — see
   * `mailboxCount` in questions.ts. App.tsx falls back to the model's headcount read when
   * the mailbox question never got asked.
   */
  mailboxCount: number | null;
  profile: Profile;
  /** The user's original free text — handed to Neo's builder verbatim as `bd`. */
  businessText: string;
  /** Neo's real generated site. Null while it's still generating. */
  neoSite: NeoSite | null;
  /**
   * Model-written `because` clauses by feature id. Empty means every line uses its
   * hand-written string — see withReason. Which features appear is NOT affected by this.
   */
  reasons?: ReasonMap;
  onRestart: () => void;
}) {
  /**
   * Selected by name, not index. The suggestion list shrinks when DomScan marks a name taken
   * and can grow when a free TLD from the same batch fills the gap — an index would point at
   * the wrong row after that reshuffle.
   */
  const [chosenName, setChosenName] = useState<string | null>(null);
  /**
   * Domains the person checked themselves, appended after our suggestions.
   *
   * Our suggestions are built from one stem the model chose. That is a guess about their name,
   * and when it is wrong — or when every TLD is taken — the flow previously had no answer
   * except "start over". This is the escape hatch, and it uses the same live DomScan lookup,
   * so a name they type is verified exactly as strictly as one we suggested. Only names
   * DomScan says are free are added: a taken one is an error, not a recommendation.
   */
  const [extraDomains, setExtraDomains] = useState<DomainOption[]>([]);
  const [ownInput, setOwnInput] = useState("");
  const [ownChecking, setOwnChecking] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  /**
   * Live availability + indicative pricing, keyed by domain name. Starts empty and fills in:
   * the fixture is the optimistic first paint and the real answer corrects it.
   * Deliberately non-blocking — the reveal must never wait on a third-party service.
   */
  const [live, setLive] = useState<Record<string, DomainInfo>>({});

  /** Stem drives the lookup, so switching the selected domain doesn't refetch. */
  const stem = reveal?.domains[0]?.name.split(".")[0] ?? "";
  useEffect(() => {
    setChosenName(null);
    if (!stem) return;
    let cancelled = false;
    lookupDomains(stem).then((rows) => {
      if (cancelled || !rows.length) return;
      setLive((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.domain, r])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [stem]);

  if (error) {
    return (
      <div>
        <p className="eyebrow">Something broke</p>
        <h1>We couldn't build that.</h1>
        <p className="lede">{error}</p>
        <button className="btn" onClick={onRestart}>
          Start again
        </button>
      </div>
    );
  }

  if (loading || !reveal) {
    return (
      <div>
        <p className="eyebrow">Almost there</p>
        <h1 style={{ color: "var(--text-faint)" }}>Building your setup…</h1>
        <div className="dots" aria-label="Loading">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  // Mail-only hides the site block. Anything else (including an unanswered surface
  // question) shows it — the drafted site is too much of the payoff to hide by default.
  const showSite = surface !== "mail";
  /* Taken names are dropped once DomScan answers; free TLDs from the same batch fill the
     gaps. Suggestions first, then anything they checked themselves. Selection is by name so
     that reshuffle cannot leave a taken domain on the hero. */
  const notesByName = Object.fromEntries(reveal.domains.map((d) => [d.name, d.note]));
  const extraNames = new Set(extraDomains.map((d) => d.name));
  const suggested: DomainOption[] = availableFromLookup(
    reveal.domains.map((d) => d.name),
    Object.values(live).filter((r) => r.domain.startsWith(`${stem}.`) && !extraNames.has(r.domain)),
  ).map((row, i) => ({
    name: row.domain,
    available: row.available,
    priceInr: row.priceInr,
    note: notesByName[row.domain],
    recommended: i === 0,
  }));
  const allDomains = [...suggested, ...extraDomains];
  const domain = allDomains.find((d) => d.name === chosenName) ?? allDomains[0];

  /**
   * Check a domain the person typed.
   *
   * Explicit button, never on keystroke: each check costs DomScan credits (1 status + 1 price)
   * and debouncing a metered call is a slower way to spend the same money.
   */
  async function checkOwnDomain() {
    const raw = ownInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!raw) return;
    const dot = raw.indexOf(".");
    /* No dot means they typed a name, not a domain — assume the TLD everyone assumes. */
    const stemPart = (dot === -1 ? raw : raw.slice(0, dot)).replace(/[^a-z0-9-]/g, "");
    const tldPart = dot === -1 ? "com" : raw.slice(dot + 1).replace(/[^a-z0-9.]/g, "");
    if (!stemPart || !tldPart) {
      setOwnError("That doesn't look like a domain name.");
      return;
    }
    const name = `${stemPart}.${tldPart}`;
    if (allDomains.some((d) => d.name === name)) {
      setOwnError("That one's already in the list.");
      return;
    }
    if (live[name]?.available === false) {
      setOwnError("That one's taken.");
      return;
    }

    setOwnChecking(true);
    setOwnError(null);
    const rows = await lookupDomains(stemPart, [tldPart]);
    setOwnChecking(false);

    const row = rows.find((r) => r.domain === name) ?? rows[0];
    if (!row) {
      setOwnError("Couldn't check that one just now.");
      return;
    }
    setLive((prev) => ({ ...prev, [row.domain]: row }));
    /* Only free names join the recommendation. A taken result is an answer, not an option. */
    if (row.available !== true) {
      setOwnError(row.available === false ? "That one's taken." : "Couldn't confirm that one's free.");
      return;
    }
    setExtraDomains((prev) => [
      ...prev,
      { name: row.domain, available: true, priceInr: row.priceInr, note: "Your own idea" },
    ]);
    setChosenName(row.domain);
    setOwnInput("");
  }
  const mailboxCount = Math.max(reveal.mailboxes.length, answeredMailboxes ?? 0);

  /**
   * Why this plan, for this person. Deterministic — see features.ts. The model never picks
   * these, because inventing a Neo feature in front of the Neo product team is the worst
   * failure available to this demo.
   */
  const surfaces: FeatureSurface[] = showSite ? ["mail", "site"] : ["mail"];

  /** Plan choice + price. Deterministic — see rules.ts. */
  const rec = recommend(profile, mailboxCount);

  /* Features are filtered by the tier rules.ts just chose, so we never name something the
     plan printed underneath does not include. Must stay AFTER `recommend`. */
  const features = pickFeatures(
    profile,
    surfaces,
    2,
    rec.sitePlan?.id ?? null,
    rec.mailPlan.id,
    /* Overlay the generated reason AFTER selection and entitlement filtering, so a generation
       can change why we say a feature matters but never which feature is shown. */
  ).map((f) => withReason(f, reasons));

  /**
   * The real handoff URL. Neo's funnel takes plain query params — no encoder, no signing —
   * so we drop someone in with `bn` and `bd` already filled.
   *
   * `bn` prefers the business name NEO ITSELF extracted from the description (the header block
   * of their generated site, e.g. "Proof & Butter Bakery"). That beats our domain slug — Neo's
   * builder wants a readable name, and handing back the one their own model produced means the
   * name they see next is the name they just saw. Slug is the fallback if generation hasn't
   * landed. 55 char cap enforced in handoff.ts, matching their field limit. */
  const neoName =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : null;

  const handoffUrl = buildHandoffUrl({
    profile,
    businessName:
      neoName ?? (profile.brandName as string) ?? domain?.name.split(".")[0] ?? "your business",
    businessDescription: businessText ?? "",
    /* Neo's own classifier beat ours to it — this is the key their builder actually uses. */
    neoIndustryKey: neoSite?.industryKey,
  });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: BEAT, delayChildren: 0.15 }}
    >
      <motion.p variants={block} transition={{ duration: 0.6, ease }} className="eyebrow">
        Your setup
      </motion.p>

      {/* 1. The domain. The most convincing thing on the screen. Taken names never appear
             here — availableFromLookup drops them, and a name they typed only joins the list
             when DomScan says it is free. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }}>
        {domain ? (
          <div className="domain">
            <span className="domain-name">{domain.name}</span>
            {/* The live answer wins over the fixture. A null/absent result (network failure,
                no key, unsupported TLD) shows NO badge — silence beats a wrong "Available"
                in front of people who can check in one keystroke. */}
            {(live[domain.name]?.available ?? domain.available) === true && (
              <span className="badge">Available</span>
            )}
            {/* Price stays labelled "approx" — it is a third-party registrar's USD list price
                converted at a fixed rate, not Neo's.
                DO NOT claim the domain is free until someone verifies who that discount applies
                to. Neo's sheet shows a 100% domain discount on monthly/yearly billing, but that
                is very likely the free `co.site` SUBDOMAIN, not a registrable custom domain —
                co.site is Neo's own namespace. Claiming "free custom domain" to the people who
                set Neo's prices, and being wrong, would cost more than the claim is worth.
                Tracked in CLAUDE.md open questions. */}
            {(live[domain.name]?.priceInr ?? domain.priceInr) !== null && (
              <span className="domain-price">
                ~₹{(live[domain.name]?.priceInr ?? domain.priceInr)!.toLocaleString("en-IN")}/yr
                <span className="price-caveat">approx</span>
              </span>
            )}
          </div>
        ) : (
          <p className="domain-note">
            Every name we tried is taken. Check one of yours below.
          </p>
        )}

        {/* Alternates that remain are buyable (or still unchecked). Each is priced separately:
            a .in is not a .com is not a .co, and flattening that is what loses trust at
            checkout. */}
        {allDomains.length > 1 && (
          <div className="alts" role="group" aria-label="Choose a domain">
            {allDomains.map((d) => {
              const active = d.name === (domain?.name ?? chosenName);
              const price = live[d.name]?.priceInr ?? d.priceInr;
              return (
                <button
                  key={d.name}
                  className={`alt${active ? " alt-active" : ""}`}
                  onClick={() => setChosenName(d.name)}
                  title={d.note}
                  aria-pressed={active}
                >
                  <span className="alt-name">{d.name}</span>
                  {price !== null && (
                    <span className="alt-price">₹{price.toLocaleString("en-IN")}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {/* The escape hatch. Our three come from one stem the model guessed; when that guess
            is wrong, or every TLD is taken, this is the only way forward that is not "start
            over". Same live lookup, so a name they type is verified as strictly as ours. */}
        <div className="own-domain">
          <label className="own-label" htmlFor="own-domain-input">
            Had a different name in mind?
          </label>
          <div className="own-row">
            <input
              id="own-domain-input"
              className="own-input"
              value={ownInput}
              placeholder="thistleandtwine.co.uk"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setOwnInput(e.target.value);
                setOwnError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void checkOwnDomain();
                }
              }}
            />
            <button
              className="btn btn-ghost own-check"
              onClick={() => void checkOwnDomain()}
              disabled={ownChecking || !ownInput.trim()}
            >
              {ownChecking ? "Checking…" : "Check"}
            </button>
          </div>
          {ownError && <p className="own-error">{ownError}</p>}
        </div>

        {domain?.note && <p className="domain-note">{domain.note}</p>}
      </motion.div>

      {/* 2. Mailboxes. Each is a small argument for why this is worth paying for. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }} className="reveal-block">
        <p className="reveal-label">Your mailboxes</p>
        {reveal.mailboxes.map((m, i) => (
          <motion.div
            key={m.address}
            className="mailbox"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: BEAT * 2 + 0.18 * i, duration: 0.5, ease }}
          >
            <span className="mailbox-address">
              {m.address.split("@")[0]}
              <span className="mailbox-domain">@{domain?.name ?? "yourdomain"}</span>
            </span>
            <span className="mailbox-label">{m.label}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* 3. The site — GENERATED BY NEO, not drafted by us. This is the repositioning made
             literal: we call their real generator and show its actual output. If it hasn't
             answered yet we show nothing rather than our own placeholder copy, because the
             whole point is that the words are theirs. */}
      {showSite && (
        <motion.div variants={block} transition={{ duration: 0.7, ease }} className="reveal-block">
          <p className="reveal-label">Your site, generated by Neo</p>
          {/* Neo's generator takes 22–38s measured. Showing their own loader copy while we
              wait beats an empty gap, and beats inventing placeholder copy — the whole point
              is that the words on this card are theirs. */}
          {neoSite ? <NeoSitePreview site={neoSite} delay={BEAT * 3} /> : <NeoSiteGenerating />}
        </motion.div>
      )}

      {/* 3b. Why this shape, for this person. One real Neo feature per surface, each tied
             to something they actually told us. Generic benefit copy is what we're beating. */}
      {features.length > 0 && (
        <motion.div variants={block} transition={{ duration: 0.7, ease }} className="reveal-block">
          <p className="reveal-label">Worth knowing</p>
          {features.map((f, i) => (
            <motion.div
              key={f.id}
              className="feature"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: BEAT * 3 + 0.16 * i, duration: 0.5, ease }}
            >
              <span className="feature-name">{f.name}</span>
              <span className="feature-because">— {f.because}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* 4. Plan and price, quietly, last. Chosen by rules.ts, priced from Neo's own sheet —
             the model is never asked and never sees a number. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }} className="plan-line">
        <div>
          <div className="plan-name">
            {rec.mailPlan.name}
            {rec.sitePlan ? ` + ${rec.sitePlan.name} site` : ""}
            {rec.monthlyInr !== null && (
              <span className="plan-price">
                {" "}
                ₹{rec.monthlyInr.toLocaleString("en-IN")}/mo
              </span>
            )}
          </div>
          <div className="plan-meta">
            {rec.rationale} {CYCLE_LABEL[rec.cycle]} · cancel anytime · you finish the site in
            Neo's builder
          </div>
          {/* Neo does not sell custom domains yet — the only live options are the free
              .co.site subdomain or connecting one you already own. This recommender is built
              for the service that hasn't shipped. Saying so is stronger than hiding it: it is
              the reason the project exists. */}
          <div className="plan-meta plan-note">
            {domain
              ? `We'll copy ${domain.name} for you — Neo's domain purchase is coming, so for now you'll connect it under "use a domain I own".`
              : `Neo's domain purchase is coming, so for now you'll connect a name you own.`}
          </div>
        </div>
        <div className="row" style={{ marginTop: 0 }}>
          {/* A real link into Neo's funnel, carrying the business name and description their
              builder already consumes. An <a>, not a scripted redirect — CLAUDE.md rule 5:
              the handoff is always a thing a person clicks.
              target=_blank so the demo doesn't navigate away from the reveal mid-pitch. */}
          <a
            className="btn"
            href={handoffUrl}
            target="_blank"
            rel="noopener noreferrer"
            autoFocus
            onClick={() => {
              /* Copy the chosen domain on the way out. Neo's domain step has no param that
                 prefills its search box (tested: none of domain/domainName/q/search/sld/
                 searchTerm work), and "Use a domain I own" is a button opening a modal, so it
                 isn't deep-linkable either. Copying is the only thing that saves the retype.
                 Best-effort: clipboard can be denied, and the handoff must still happen. */
              if (domain) void navigator.clipboard?.writeText(domain.name).catch(() => {});
            }}
          >
            Claim it and start building
          </a>
          <button className="btn btn-ghost" onClick={onRestart}>
            Start over
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
