import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DomainOption, RevealContent } from "../lib/session";
import {
  availableFromLookup,
  checkTitanOrder,
  COSITE_SUFFIX,
  isCoSite,
  lookupDomains,
  type DomainInfo,
} from "../lib/domains";
import { pickFeatures, withReason, type FeatureSurface, type ReasonMap } from "../lib/features";
import { recommend, priceAs, CYCLE_LABEL, domainFirstCycleInr } from "../lib/rules";
import type { RationaleResult } from "../lib/api";
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
  rationale?: RationaleResult;
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

  /**
   * Which of Neo's two templates they picked, by `templateKey`.
   *
   * Null until they choose, and null is a real state: it means "we did not ask them to decide
   * something they had no opinion about", and the handoff then omits `templateKey` so Neo
   * picks as it does today. Defaulting it to the first pane would put a choice in the URL
   * that nobody made, which is the thing this control exists to stop.
   *
   * DECLARED HERE, with the other hooks, and it must stay here. It used to sit two hundred
   * lines down, below the `error` and `loading` early returns — so a render that took either
   * branch ran nine hooks and the render after it ran ten, which is "Rendered more hooks than
   * during the previous render". Latent only because the reveal is usually mounted with its
   * data already in hand.
   */
  const [chosenTemplate, setChosenTemplate] = useState<string | null>(null);

  /**
   * They took the cheaper plan we offered them.
   *
   * Null is the recommendation as solved. Non-null means the person read what the cheaper tier
   * would cost them and chose it anyway — which is a decision they are entitled to make, and
   * the opposite of the failure mode this whole project is arguing against.
   */
  const [swap, setSwap] = useState<{ mail: string; site: string } | null>(null);

  /**
   * Names Neo already holds an order for, so we can stop recommending them.
   *
   * DomScan and Neo answer different questions — see `checkTitanOrder`. A name can be free at
   * the registry and already spoken for at Neo, and that is the combination that sends someone
   * to a checkout that cannot complete.
   *
   * Only ever holds names we asked about, and we ask about ONE at a time: the name currently
   * on offer. `false` means confirmed free at Neo; a name absent from this map is simply
   * unchecked, which is the same state the reveal was always in before this existed.
   */
  const [titanTaken, setTitanTaken] = useState<Record<string, boolean>>({});
  const titanAsked = useRef<Set<string>>(new Set());

  const verifyTitan = useCallback((name: string) => {
    if (!name || titanAsked.current.has(name)) return;
    titanAsked.current.add(name);
    void checkTitanOrder(name).then((taken) => {
      /* null is "could not tell" and is deliberately NOT recorded: an unreachable admin
         session must never read as a verdict in either direction. */
      if (taken === null) return;
      setTitanTaken((prev) => ({ ...prev, [name]: taken }));
    });
  }, []);

  /**
   * Check the name we are actually recommending, once the lookup settles.
   *
   * One call, for the top suggestion — not one per suggestion. Three per page view is the
   * traffic `PANEL_MAX_PER_WINDOW` exists to keep off an admin-session endpoint, and the two
   * names nobody picks are not worth spending it on. Selecting a different name below checks
   * that one too, because by then it is the one being recommended.
   */
  useEffect(() => {
    if (!reveal?.domains.length) return;
    /* Excludes names already known taken at Neo, so that when the top suggestion is dropped
       the REPLACEMENT gets checked in turn rather than being recommended unverified. Walks
       down the list one name at a time, which is the point: still one call per name that is
       actually on offer, never one per suggestion. */
    const top = availableFromLookup(
      reveal.domains.map((d) => d.name).filter((n) => titanTaken[n] !== true),
      Object.values(live).filter((r) => titanTaken[r.domain] !== true),
    )[0];
    /* `.co.site` already goes through its own Neo-aware ladder in cositeService, which reads
       the same order records. Asking again here would spend a second panel call to learn what
       the batch lookup was told. */
    if (top && !isCoSite(top.domain)) verifyTitan(top.domain);
  }, [reveal, live, titanTaken, verifyTitan]);

  /**
   * EVERY suggested name's stem, not just the first one.
   *
   * This used to be `reveal.domains[0].name.split(".")[0]` — one stem — and the lookup below
   * then filtered its own results back down to that stem. So the model could suggest three
   * genuinely different names and the reveal would show the first one with `.com`, `.in` and
   * `.co` after it. That is the "the domains aren't personalised" feedback, in full.
   *
   * `.co.site` is excluded from the stem list only in the sense that it needs no separate
   * stem: it is one of the TLDs asked for, answered for the first stem (see domainService).
   */
  const stems = [
    ...new Set(
      (reveal?.domains ?? [])
        .map((d) => d.name.split(".")[0])
        .filter((s): s is string => Boolean(s)),
    ),
  ];
  const stem = stems[0] ?? "";
  /* Joined so the effect re-runs on a genuine change of names, not on every re-render — an
     array literal is a new reference each time and would loop the lookup forever. */
  const stemKey = stems.join(",");

  useEffect(() => {
    setChosenName(null);
    if (!stemKey) return;
    let cancelled = false;
    lookupDomains(stemKey.split(",")).then((rows) => {
      if (cancelled || !rows.length) return;
      setLive((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.domain, r])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [stemKey]);

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
  /* No stem filter. It existed because only one stem was ever looked up, so rows for any
     other stem could only be stale — now they are the point, and filtering them out would
     throw away the two extra names we just paid to check. `extraNames` is still excluded:
     a domain the person typed themselves is theirs, not a suggestion to re-rank. */
  const lookedUp = availableFromLookup(
    reveal.domains.map((d) => d.name),
    Object.values(live).filter((r) => !extraNames.has(r.domain)),
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
  const allDomainsRaw = [...suggested, ...extraDomains.filter((d) => !suggested.some((s) => s.name === d.name))];

  /**
   * Drop anything Neo already has an order for.
   *
   * DomScan said these were free and, for the registry, it was right — Neo's own records are a
   * second question, and this is where its answer lands. Dropping rather than badging is
   * deliberate and matches how a registry-taken name is already handled two lines up: a name
   * that cannot be bought is not a recommendation, and showing it with a warning invites
   * someone to click it anyway.
   *
   * Only names actually confirmed taken are removed. Unchecked and unknown both stay, so a
   * panel that is unreachable leaves the list exactly as it was before this check existed.
   */
  const allDomains = allDomainsRaw.filter((d) => titanTaken[d.name] !== true);
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

    /**
     * Free at the registry, but is it already an order at Neo?
     *
     * This is the manual path, which is the one place the Partner Panel rung is already
     * allowed, and the person has just told us this is the name they want — so it is exactly
     * the name worth the call. Awaited rather than fired off, because unlike the suggestions
     * there is nothing else on screen to fall back to: adding it and then removing it a second
     * later would be worse than making them wait for the answer.
     *
     * A `null` (could not tell) adds the name as before. We do not know it is taken, and
     * refusing on an unreachable admin session would block a name that is probably fine.
     */
    if (!isCoSite(name)) {
      setOwnChecking(true);
      const taken = await checkTitanOrder(name);
      setOwnChecking(false);
      titanAsked.current.add(name);
      if (taken === true) {
        setTitanTaken((prev) => ({ ...prev, [name]: true }));
        setOwnError("That one's already set up on Neo.");
        return;
      }
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
  const solved = recommend(
    profile,
    mailboxCount,
    verdict?.raised ? { mail: verdict.mailTier, site: verdict.siteTier } : null,
  );

  /**
   * What is actually on screen: the solved recommendation, or the cheaper tier if they took it.
   *
   * `needs` and `viable` are carried across unchanged from the solve, on purpose. They describe
   * what this business established a requirement for, and taking a cheaper plan does not
   * un-establish it — that is exactly the information someone needs to make this trade
   * knowingly. The swap notice below says which of them is no longer covered.
   */
  const cheaperStep = rationale?.cheaperStep ?? null;
  const swappedPrice = swap
    ? priceAs(swap.mail, swap.site, solved.mailboxes, solved.cycle)
    : null;
  const rec = swappedPrice ? { ...solved, ...swappedPrice } : solved;

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
  /**
   * The domain as a per-month figure, so it can join a monthly total.
   *
   * Null means we genuinely do not know — DomScan has not answered, or answered without a
   * price — and the row is then omitted rather than shown as zero. A missing price and a free
   * name are different facts and must not render the same.
   *
   * `.co.site` is 0 for the first billing cycle (Neo's own namespace) and Neo has not
   * published a renewal figure, which is why the row says "free first cycle" rather than
   * implying it stays free.
   */
  const domainMonthly = domain?.free
    ? 0
    : livePrice !== null
      ? Math.round(livePrice / 12)
      : null;
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
              {/* `.co.site` is not "available", it is FREE, and it earns the same pill the
                  other names get rather than a different-shaped price. Gradient rather than
                  green because free is a different KIND of answer to available — and the
                  gradient is Neo's own, so it still belongs on their page. */}
              {domain.free ? (
                <span className="badge badge-free">Free</span>
              ) : (
                <>
                  {liveAvail === true && <span className="badge">Available</span>}
                  {liveAvail === false && <span className="badge badge-taken">Taken</span>}
                </>
              )}
              {domain.free ? (
                /* The badge above already says Free; this is only the caveat, because
                   free-for-the-first-cycle and free are different promises. */
                <span className="domain-price domain-free">
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
                      /* Now that this is the name being recommended, it is the one worth
                         spending a panel call on. Cached per name, so re-clicking is free. */
                      if (!isCoSite(d.name)) verifyTitan(d.name);
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
            {/* See the note below the list: we bill `rec.mailboxes` and the model may have named
                fewer, so the difference is stated rather than left for the reader to notice. */}
            {reveal.mailboxes.slice(0, rec.mailboxes).map((m) => (
              <div key={m.address} className="mailbox">
                <span className="mailbox-address">
                  {m.address.split("@")[0]}
                  <span className="mailbox-domain">@{domainName}</span>
                </span>
                <span className="mailbox-label">{m.label}</span>
              </div>
            ))}
            {/**
              * The arithmetic, when it does not match what is listed.
              *
              * "Three to five" resolves to four mailboxes and the price says `4 × ₹299`, but
              * the model suggests names from the description and often gives three. A reader
              * counts three addresses above a charge for four and has no way to reconcile it.
              *
              * We say it instead. Not by inventing a fourth name — that would be writing their
              * address for them — and not by billing three, because four is what they asked
              * for and each one costs the same to add.
              */}
            {rec.mailboxes > reveal.mailboxes.length && (
              <p className="mailbox-extra">
                +{rec.mailboxes - reveal.mailboxes.length} more address
                {rec.mailboxes - reveal.mailboxes.length === 1 ? "" : "es"} on your plan — name
                {rec.mailboxes - reveal.mailboxes.length === 1 ? " it" : " them"} when you set up.
              </p>
            )}
          </div>

          <div className="plan-card">
            <p className="reveal-label">Recommended plan</p>
            <div className="plan-name">
              {rec.mailPlan.name}
              {rec.sitePlan ? ` + ${rec.sitePlan.name} site` : ""}
              {/* NO PRICE HERE. It showed `rec.monthlyInr`, which is plans only, directly above
                  a Total that adds the domain — "Neo Standard + Plus site ₹1,555/mo" over
                  "Total ~₹1,643/mo". Two prices for the same thing, three lines apart, and the
                  reader has no way to know which one they pay. The breakdown below is the
                  answer and it is immediately underneath. */}
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
                  {/**
                    * THE DOMAIN, which the total left out entirely.
                    *
                    * `rec.lines` comes from rules.ts and covers mail and site only — the
                    * domain is chosen here on the reveal, after the recommendation, so the
                    * solver never sees it. The screen showed "Total Rs149/mo" above a domain
                    * priced at Rs1,050/yr on the same screen: the one number someone reads as
                    * "what this costs" was missing a third of it.
                    *
                    * Shown as a MONTHLY equivalent so the column adds up, with the real yearly
                    * figure beside it — a Rs1,050/yr domain dropped into a monthly column with
                    * no unit would be a worse lie than omitting it. `~` because DomScan's
                    * price is indicative, which is the same caveat the hero already carries.
                    */}
                  {domainMonthly !== null && (
                    <tr>
                      <th scope="row">{domain?.name ?? "Domain"}</th>
                      <td className="bd-qty">
                        {domain?.free
                          ? "free first cycle"
                          : `~₹${(livePrice ?? 0).toLocaleString("en-IN")}/yr`}
                      </td>
                      <td className="bd-total">
                        {domainMonthly === 0 ? "₹0" : `~₹${domainMonthly.toLocaleString("en-IN")}`}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="bd-qty">{CYCLE_LABEL[rec.cycle]} · cancel anytime</td>
                    <td className="bd-total">
                      {domainMonthly === null ? "" : "~"}₹
                      {(rec.monthlyInr + (domainMonthly ?? 0)).toLocaleString("en-IN")}/mo
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
            {/**
              * The cheaper plan, with its price and a way to actually take it.
              *
              * It used to be a sentence saying what they would lose and nothing else, which
              * told someone a trade existed while giving them no way to weigh or make it. The
              * saving is the missing half of that sentence, and the button is the missing half
              * of the screen.
              *
              * `whyNotCheaper` is hidden once swapped: the model wrote it about dropping FROM
              * the solved tier, so on the cheaper plan it describes a step they have already
              * taken and reads as though it were still ahead of them.
              */}
            {!swap && cheaperStep && (
              <div className="plan-cheaper-offer">
                {rationale?.whyNotCheaper && (
                  <p className="plan-meta plan-cheaper">{rationale.whyNotCheaper}</p>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    unlockSound();
                    playSound("select");
                    setSwap(
                      cheaperStep.dimension === "mail"
                        ? { mail: cheaperStep.toId, site: solved.sitePlan?.id ?? "none" }
                        : { mail: solved.mailPlan.id, site: cheaperStep.toId },
                    );
                  }}
                >
                  Switch to {cheaperStep.toName}
                  {cheaperStep.saveInr ? ` · save ₹${cheaperStep.saveInr.toLocaleString("en-IN")}/mo` : ""}
                </button>
              </div>
            )}

            {swap && (
              <div className="plan-cheaper-offer plan-swapped">
                <p className="plan-meta">
                  You picked the cheaper plan.{" "}
                  {solved.needs.length > 0
                    ? "The reason we suggested the other one is still above — worth a look before you buy."
                    : ""}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    unlockSound();
                    playSound("select");
                    setSwap(null);
                  }}
                >
                  Back to {solved.mailPlan.name}
                  {solved.sitePlan ? ` + ${solved.sitePlan.name}` : ""}
                </button>
              </div>
            )}

            {/* No cheaper step at all — already on the entry tier. Say nothing. */}
            {!swap && !cheaperStep && rationale?.whyNotCheaper && (
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
