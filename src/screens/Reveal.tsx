import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { RevealContent } from "../lib/session";
import { lookupDomains, type DomainInfo } from "../lib/domains";
import { pickFeatures, type FeatureSurface } from "../lib/features";
import { recommend, CYCLE_LABEL } from "../lib/rules";
import NeoSitePreview from "../components/NeoSitePreview";
import NeoSiteGenerating from "../components/NeoSiteGenerating";
import type { NeoSite } from "../lib/neoSite";
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
 *  - The CTA hands off into Neo's existing builder. It is a link a person clicks, never a
 *    silent redirect, and it is inert in this build.
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
  teamSize,
  profile,
  neoSite,
  onRestart,
}: {
  reveal: RevealContent | null;
  loading: boolean;
  error: string | null;
  surface: string | null;
  teamSize: number | null;
  profile: Profile;
  /** Neo's real generated site. Null while it's still generating. */
  neoSite: NeoSite | null;
  onRestart: () => void;
}) {
  const [chosenDomain, setChosenDomain] = useState(0);
  /**
   * Live availability + indicative pricing, keyed by domain name. Starts empty and fills in:
   * the fixture is the optimistic first paint and the real answer corrects it.
   * Deliberately non-blocking — the reveal must never wait on a third-party service.
   */
  const [live, setLive] = useState<Record<string, DomainInfo>>({});

  /** Stem drives the lookup, so switching the selected domain doesn't refetch. */
  const stem = reveal?.domains[0]?.name.split(".")[0] ?? "";
  useEffect(() => {
    if (!stem) return;
    let cancelled = false;
    lookupDomains(stem).then((rows) => {
      if (cancelled || !rows.length) return;
      setLive(Object.fromEntries(rows.map((r) => [r.domain, r])));
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
  const domain = reveal.domains[chosenDomain] ?? reveal.domains[0];
  const mailboxCount = Math.max(reveal.mailboxes.length, teamSize ?? 0);

  /**
   * Why this plan, for this person. Deterministic — see features.ts. The model never picks
   * these, because inventing a Neo feature in front of the Neo product team is the worst
   * failure available to this demo.
   */
  const surfaces: FeatureSurface[] = showSite ? ["mail", "site"] : ["mail"];
  const features = pickFeatures(profile, surfaces);

  /** Plan choice + price. Deterministic — see rules.ts. */
  const rec = recommend(profile, mailboxCount);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: BEAT, delayChildren: 0.15 }}
    >
      <motion.p variants={block} transition={{ duration: 0.6, ease }} className="eyebrow">
        Your setup
      </motion.p>

      {/* 1. The domain. The most convincing thing on the screen. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }}>
        <div className="domain">
          <span className="domain-name">{domain.name}</span>
          {/* The live answer wins over the fixture's optimistic flag. A null/absent result
              (network failure, no key, unsupported TLD) shows NO badge — silence beats a
              wrong "Available" in front of people who can check in one keystroke. */}
          {(live[domain.name]?.available ?? domain.available) === true && (
            <span className="badge">Available</span>
          )}
          {live[domain.name]?.available === false && (
            <span className="badge badge-taken">Taken</span>
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

        {/* All options stay in the row, with the active one marked — hiding the selected one
            made the row reshuffle on every switch and meant you could never see the full set
            at once. Each is priced separately: a .in is not a .com is not a .co, and flattening
            that is what loses trust at checkout. */}
        {reveal.domains.length > 1 && (
          <div className="alts" role="group" aria-label="Choose a domain">
            {reveal.domains.map((d, i) => {
              const active = i === chosenDomain;
              const taken = live[d.name]?.available === false;
              const price = live[d.name]?.priceInr ?? d.priceInr;
              return (
                <button
                  key={d.name}
                  className={`alt${active ? " alt-active" : ""}`}
                  onClick={() => setChosenDomain(i)}
                  title={d.note}
                  aria-pressed={active}
                >
                  <span className="alt-name">{d.name}</span>
                  {price !== null && (
                    <span className="alt-price">₹{price.toLocaleString("en-IN")}</span>
                  )}
                  {taken && <span className="alt-taken">taken</span>}
                </button>
              );
            })}
          </div>
        )}
        {domain.note && <p className="domain-note">{domain.note}</p>}
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
              <span className="mailbox-domain">@{domain.name}</span>
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
        </div>
        <div className="row" style={{ marginTop: 0 }}>
          <button className="btn" autoFocus>
            Claim it and start building
          </button>
          <button className="btn btn-ghost" onClick={onRestart}>
            Start over
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
