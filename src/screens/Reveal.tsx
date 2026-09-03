import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DomainOption, RevealContent } from "../lib/session";
import {
  availableFromLookup,
  COSITE_SUFFIX,
  lookupDomains,
  type DomainInfo,
} from "../lib/domains";
import { pickFeatures, withReason, type FeatureSurface, type ReasonMap } from "../lib/features";
import { recommend, CYCLE_LABEL, domainFirstCycleInr } from "../lib/rules";
import { buildHandoffUrl } from "../lib/handoff";
import SetupStory from "../components/SetupStory";
import { block as blockData, type NeoSite } from "../lib/neoSite";
import type { Profile } from "../lib/engine";
import { playSetupReady, playSound, unlockSound } from "../sound";

/**
 * Locked-viewport reveal. Squarespace Blueprint / Wix ADI / Linear-settings pattern:
 * the page does not scroll; left is the recommendation, right is a live preview pane.
 * Taken domains never appear — availableFromLookup drops them (Darrel, 3 Sep).
 * `.co.site` is the fourth recommended name — Neo's own namespace, and the one thing the
 * domain step can actually sell today. Its availability comes from cositeService, which
 * answers `null` (unknown) unless NEO_COSITE_CHECK_URL is wired, and null renders NO
 * badge. The admin-session lookup that could answer properly lives in tools/, not here:
 * a public function behind it is an enumeration oracle. Darrel's call, 03 Sep.
 */

export default function Reveal({
  reveal,
  loading,
  error,
  surface,
  mailboxCount: answeredMailboxes,
  profile,
  businessText,
  neoSite,
  neoSiteAlt = null,
  reasons,
  rationale,
  verdict,
  onRestart,
}: {
  reveal: RevealContent | null;
  loading: boolean;
  error: string | null;
  surface: string | null;
  mailboxCount: number | null;
  profile: Profile;
  businessText: string;
  neoSite: NeoSite | null;
  neoSiteAlt?: NeoSite | null;
  reasons?: ReasonMap;
  rationale?: { rationale: string; whyNotCheaper: string; because: string };
  verdict?: {
    mailTier: string;
    siteTier: string;
    raised: boolean;
    cites: { entitlement: string; evidence: string }[];
  } | null;
  onRestart: () => void;
}) {
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [extraDomains, setExtraDomains] = useState<DomainOption[]>([]);
  const [ownInput, setOwnInput] = useState("");
  const [ownChecking, setOwnChecking] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, DomainInfo>>({});
  const revealCuePlayed = useRef(false);

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

  useEffect(() => {
    if (error) return;
    if (revealCuePlayed.current) return;
    revealCuePlayed.current = true;
    playSetupReady();
  }, [error]);

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

  const showSite = surface !== "mail";
  const notesByName = Object.fromEntries(reveal.domains.map((d) => [d.name, d.note]));
  const extraNames = new Set(extraDomains.map((d) => d.name));
  const lookedUp = availableFromLookup(
    reveal.domains.map((d) => d.name),
    Object.values(live).filter((r) => r.domain.startsWith(`${stem}.`) && !extraNames.has(r.domain)),
  );
  const suggested: DomainOption[] = (
    lookedUp.length > 0
      ? lookedUp.map((row, i) => ({
          name: row.domain,
          available: row.available,
          free: row.free,
          priceInr: row.priceInr,
            note: notesByName[row.domain],
          recommended: i === 0,
        }))
      : reveal.domains
  );
  const coSiteTaken = live[`${stem}.${COSITE_SUFFIX}`]?.available === false;
  const allDomains = [...suggested, ...extraDomains.filter((d) => !suggested.some((s) => s.name === d.name))];
  const domain = allDomains.find((d) => d.name === chosenName) ?? allDomains[0];

  async function checkOwnDomain() {
    const raw = ownInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!raw) return;
    unlockSound();
    playSound("select");
    const dot = raw.indexOf(".");
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
    if (row.available !== true) {
      setOwnError(row.available === false ? "That one's taken." : "Couldn't confirm that one's free.");
      return;
    }
    setExtraDomains((prev) => [
      ...prev,
      {
        name: row.domain,
        available: true,
        priceInr: row.priceInr,
        note: "Your own idea",
      },
    ]);
    setChosenName(row.domain);
    setOwnInput("");
  }

  const mailboxCount = Math.max(reveal.mailboxes.length, answeredMailboxes ?? 0);
  const surfaces: FeatureSurface[] = showSite ? ["mail", "site"] : ["mail"];
  const rec = recommend(
    profile,
    mailboxCount,
    verdict?.raised ? { mail: verdict.mailTier, site: verdict.siteTier } : null,
  );

  /* First-cycle price for a .co.site name — 0 today, but derived, so a two-year cycle
     stops it saying "Free" without anyone remembering to. */
  const firstCycle = domainFirstCycleInr(rec.cycle);
  const features = pickFeatures(
    profile,
    surfaces,
    2,
    rec.sitePlan?.id ?? null,
    rec.mailPlan.id,
  ).map((f) => withReason(f, reasons));

  const neoName =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : null;

  /**
   * Which of Neo's two templates they picked, by `templateKey`.
   *
   * Null until they choose, and null is a real state: it means "we did not ask them to decide
   * something they had no opinion about", and the handoff then omits `templateKey` so Neo
   * picks as it does today. Defaulting it to the first pane would put a choice in the URL
   * that nobody made, which is the thing this control exists to stop.
   */
  const [chosenTemplate, setChosenTemplate] = useState<string | null>(null);

  const handoffUrl = buildHandoffUrl({
    profile,
    businessName:
      neoName ?? (profile.brandName as string) ?? domain?.name.split(".")[0] ?? "your business",
    businessDescription: businessText ?? "",
    neoIndustryKey: neoSite?.industryKey,
    neoTemplateKey: chosenTemplate,
  });

  const liveAvail = domain ? (live[domain.name]?.available ?? domain.available) : null;
  const livePrice = domain ? (live[domain.name]?.priceInr ?? domain.priceInr) : null;
  const domainName = domain?.name ?? `${stem || "yourbusiness"}.com`;

  return (
    <div className="reveal-page">
      <div className="reveal-split">
        <section className="reveal-setup">
          <div className="reveal-setup-main">
          <p className="eyebrow">Your setup</p>

          <div className="reveal-domain">
          <p className="reveal-label">Recommended domain</p>
          {domain ? (
            <div className="domain">
              <span className="domain-name">{domain.name}</span>
              {liveAvail === true && <span className="badge">Available</span>}
              {liveAvail === false && <span className="badge badge-taken">Taken</span>}
              {domain.free ? (
                <span className="domain-price domain-free">
                  {firstCycle === 0
                    ? "Free"
                    : firstCycle != null
                      ? `₹${firstCycle.toLocaleString("en-IN")}/mo`
                      : "Free"}
                  <span className="price-caveat">first billing cycle</span>
                </span>
              ) : (
                livePrice !== null && (
                  <span className="domain-price">
                    ~₹{livePrice.toLocaleString("en-IN")}/yr
                    <span className="price-caveat">approx</span>
                  </span>
                )
              )}
            </div>
          ) : (
            <p className="domain-note">Every name we tried is taken. Check one of yours below.</p>
          )}

          {allDomains.length > 0 && (
            <div className="alts" role="group" aria-label="Choose a domain">
              {allDomains.map((d) => {
                const active = d.name === (domain?.name ?? chosenName);
                const price = live[d.name]?.priceInr ?? d.priceInr;
                const taken = (live[d.name]?.available ?? d.available) === false;
                return (
                  <button
                    key={d.name}
                    /* `.alt-cosite` marks the one option that is free rather than priced, so
                       it reads as a different KIND of choice before anyone reads the word. */
                    className={`alt${active ? " alt-active" : ""}${d.free ? " alt-cosite" : ""}`}
                    onClick={() => {
                      unlockSound();
                      playSound("select");
                      setChosenName(d.name);
                    }}
                    title={d.note}
                    aria-pressed={active}
                  >
                    <span className="alt-name">{d.name}</span>
                    {d.free ? (
                      <span className="alt-price alt-free">
                        {firstCycle === 0
                          ? "Free"
                          : firstCycle != null
                            ? `₹${firstCycle.toLocaleString("en-IN")}`
                            : "Free"}
                      </span>
                    ) : (
                      price !== null && (
                        <span className="alt-price">₹{price.toLocaleString("en-IN")}</span>
                      )
                    )}
                    {taken && <span className="alt-taken">taken</span>}
                  </button>
                );
              })}
            </div>
          )}


          {coSiteTaken && (
            <p className="domain-note domain-note-taken">
              <strong>
                {stem}.{COSITE_SUFFIX}
              </strong>{" "}
              is already in use on Neo — the free subdomain needs a different name.
            </p>
          )}

          {/* THERE IS NO DOMAIN-HANDOFF NOTE. It read "We'll copy <name> for you — Neo's
              domain purchase is coming, so for now you'll connect it under 'use a domain I
              own'." Removed at Hari's call, 03 Sep, and it is worth saying why it went rather
              than moving again: it explains OUR limitation at the moment someone is deciding,
              on the one screen that has to be perfect. The .co.site variant was no better —
              "free for your first billing cycle, claim it on the next screen" is a promise
              about a screen they have not reached.
              The handoff itself still carries `bn` and `bd`, so nothing about the flow
              changes; only the apology for it is gone. */}
          <details className="own-domain">
            <summary className="own-label">Had a different name in mind?</summary>
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
          </details>
          </div>

          <div className="reveal-block reveal-block-tight">
            <p className="reveal-label">Your mailboxes</p>
            {/**
              * SLICED TO WHAT THEY ASKED FOR. Run cz3npnaz: they answered "Just one", the plan
              * priced one, and the screen showed three — hello@, tickets@ and support@ — so
              * the page contradicted both the answer and the price directly above it.
              *
              * The model suggests names from the description before any question is asked, so
              * `suggestedMailboxes` never knew the count; it was being rendered whole. `rec`
              * is the authority because it is what we charge for.
              *
              * Deliberately no padding when the model returns FEWER than the count. Showing
              * three real suggestions against a price for five is a gap; inventing a
              * `mailbox4@` to close it would be us writing their addresses for them.
              */}
            {reveal.mailboxes.slice(0, rec.mailboxes).map((m) => (
              <div key={m.address} className="mailbox">
                <span className="mailbox-address">
                  {m.address.split("@")[0]}
                  <span className="mailbox-domain">@{domainName}</span>
                </span>
                <span className="mailbox-label">{m.label}</span>
              </div>
            ))}
          </div>

          <div className="plan-card">
            <p className="reveal-label">Recommended plan</p>
            <div className="plan-name">
              {rec.mailPlan.name}
              {rec.sitePlan ? ` + ${rec.sitePlan.name} site` : ""}
              {rec.monthlyInr !== null && (
                <span className="plan-price"> ₹{rec.monthlyInr.toLocaleString("en-IN")}/mo</span>
              )}
            </div>
            {/**
              * ONLY when `because` is absent, and this was a real bug on 03 Sep.
              *
              * `because` was added to replace this block and the needs bullets, and the
              * bullets were duly swapped — but this line was left in, so the card carried two
              * generated sentences about the same decision. Live, for a ticket reseller:
              *
              *   plan-why  "...a solo ticket reseller moving customers from social messages
              *              and personal email."
              *   because   "...email and a website move you beyond social messages and
              *              personal email."
              *
              * Same clause, twice, on the screen we were shortening. `because` wins because it
              * is built from the solver's own needs and can be checked against them; this one
              * is free-form and cannot. It stays as the fallback, which is what it was.
              */}
            {!rationale?.because && (
              <p className="plan-why">{rationale?.rationale || rec.rationale}</p>
            )}

            {/**
             * What the total is made of.
             *
             * The single figure above hides the one thing that most often explains it: mail is
             * priced PER MAILBOX, so "three to five addresses" quietly multiplies the tier.
             * The needs list cannot say this, because the multiplication is not a need — it is
             * arithmetic, and until now it was arithmetic nobody was shown.
             */}
            {rec.monthlyInr !== null && (
              <table className="plan-breakdown">
                <tbody>
                  {rec.lines.map((l) => (
                    <tr key={l.label}>
                      <th scope="row">{l.label}</th>
                      <td className="bd-qty">
                        {l.qty > 1 && l.each !== null
                          ? `${l.qty} × ₹${l.each.toLocaleString("en-IN")}`
                          : ""}
                      </td>
                      <td className="bd-total">
                        {l.totalInr !== null ? `₹${l.totalInr.toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="bd-qty">{CYCLE_LABEL[rec.cycle]} · cancel anytime</td>
                    <td className="bd-total">
                      ₹{rec.monthlyInr.toLocaleString("en-IN")}/mo
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Features WITH their reason. Moin's version joined the names with " · ", which
                drops the personalisation — "Invoice Builder" alone is a catalogue entry;
                "Invoice Builder — you can make repair quotes from the inbox" is why we picked
                this plan for them. The reason is what makes the screen a justification. */}
            {features.length > 0 && (
              <ul className="plan-features">
                {features.map((f) => (
                  <li key={f.id}>
                    <span className="feature-name">{f.name}</span>
                    <span className="feature-because"> — {f.because}</span>
                  </li>
                ))}
              </ul>
            )}
            {/**
              * One line, or the bullets it replaced.
              *
              * `because` joins the solver's own reasons into a sentence — same reasons, same
              * order of importance, one block instead of three. The bulleted fallback is not
              * a lesser version: it is what shipped before, and it renders whenever the model
              * is slow, degraded, or in replay. Losing brevity is acceptable; losing the
              * justification is not.
              *
              * The model's accepted citations stay separate either way — "you said ..." is a
              * quote we verified against their own words, and folding a quote into generated
              * prose would make it look written rather than found.
              */}
            {/**
              * Cross-faded, because this block UPGRADES under the reader.
              *
              * The reveal renders the instant the last question is answered — `rec` is
              * deterministic, so nothing waits — and `/api/rationale` lands a few seconds
              * later. When it does, three bullets are replaced by one sentence: a hard swap
              * and a height change, in a paragraph someone is mid-way through reading.
              *
              * This is the only content on the screen that changes after it appears, so it is
              * the only place a transition is doing real work rather than decoration.
              * `mode="wait"` so the outgoing block clears before the incoming one measures,
              * which is what stops the height jump.
              */}
            <AnimatePresence mode="wait" initial={false}>
              {rationale?.because ? (
                <motion.p
                  key="because"
                  className="plan-because"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                >
                  {rationale.because}
                </motion.p>
              ) : (
                rec.needs.length > 0 && (
                  <motion.ul key="needs" className="plan-needs" exit={{ opacity: 0 }}>
                    {rec.needs.map((n) => (
                      <li key={n.id}>{n.because}</li>
                    ))}
                  </motion.ul>
                )
              )}
            </AnimatePresence>
            {verdict?.raised && verdict.cites.length > 0 && (
              <ul className="plan-needs">
                {verdict.cites.map((c) => (
                  <li key={c.entitlement} className="need-from-words">
                    you said “{c.evidence}”
                  </li>
                ))}
              </ul>
            )}
            {rationale?.whyNotCheaper && (
              <p className="plan-meta plan-cheaper">{rationale.whyNotCheaper}</p>
            )}

          </div>
          </div>

          <div className="row reveal-cta">
            <a
              className="btn"
              href={handoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              autoFocus
              onClick={() => {
                unlockSound();
                playSound("cta");
                void navigator.clipboard?.writeText(domainName).catch(() => {});
              }}
            >
              Claim it and start building
            </a>
            <button className="btn btn-ghost" onClick={onRestart}>
              Start over
            </button>
          </div>
        </section>

        <SetupStory
          domain={domainName}
          showSite={showSite}
          neoSite={neoSite}
          neoSiteAlt={neoSiteAlt}
          profile={profile}
          mailPlanId={rec.mailPlan.id}
          mailPlanName={rec.mailPlan.name}
          /* The same bullets the plan card shows. On a mail-only Starter only one film is
             entitlement-legal, and these fill the pane rather than stretching that one. */
          features={features.map((f) => ({ id: f.id, name: f.name, because: f.because }))}
          chosenTemplate={chosenTemplate}
          onChooseTemplate={(key) => {
            unlockSound();
            playSound("select");
            /* Tapping the chosen one again clears it, so a mis-tap is undoable without a
               "none of these" control. Back to null means Neo picks, as it does today. */
            setChosenTemplate((prev) => (prev === key ? null : key));
          }}
        />
      </div>
    </div>
  );
}
