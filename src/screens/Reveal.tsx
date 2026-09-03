import { useEffect, useRef, useState } from "react";
import type { DomainOption, RevealContent } from "../lib/session";
import { lookupDomains, type DomainInfo } from "../lib/domains";
import { pickFeatures, type FeatureSurface } from "../lib/features";
import { recommend, CYCLE_LABEL } from "../lib/rules";
import { buildHandoffUrl } from "../lib/handoff";
import NeoSitePreview from "../components/NeoSitePreview";
import NeoSiteGenerating from "../components/NeoSiteGenerating";
import SetupStory from "../components/SetupStory";
import { block as blockData, type NeoSite } from "../lib/neoSite";
import type { Profile } from "../lib/engine";
import { playSetupReady, playSound, unlockSound } from "../sound";

/**
 * THE screen. Domain, mailboxes, plan and CTA stay above the fold on a laptop.
 * Visual story on the right follows Mailchimp/Rinda: justify the recommendation, show
 * what you get, keep start-over visible (docs/competitor-qualification.md).
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
  onRestart: () => void;
}) {
  const [chosenDomain, setChosenDomain] = useState(0);
  const [userPickedDomain, setUserPickedDomain] = useState(false);
  const [extraDomains, setExtraDomains] = useState<DomainOption[]>([]);
  const [ownInput, setOwnInput] = useState("");
  const [ownChecking, setOwnChecking] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, DomainInfo>>({});
  const revealCuePlayed = useRef(false);

  const stem = reveal?.domains[0]?.name.split(".")[0] ?? "";
  useEffect(() => {
    if (!stem) return;
    let cancelled = false;
    lookupDomains(stem).then((rows) => {
      if (cancelled || !rows.length) return;
      setLive(Object.fromEntries(rows.map((r) => [r.domain, r])));

      if (userPickedDomain) return;
      const names = reveal?.domains.map((d) => d.name) ?? [];
      const chosenIsTaken = rows.some((r) => r.domain === names[chosenDomain] && !r.available);
      if (!chosenIsTaken) return;
      const freeIdx = names.findIndex((n) => rows.some((r) => r.domain === n && r.available === true));
      if (freeIdx >= 0) setChosenDomain(freeIdx);
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
  const allDomains = [...reveal.domains, ...extraDomains];
  const domain = allDomains[chosenDomain] ?? allDomains[0];

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
    setExtraDomains((prev) => [
      ...prev,
      { name: row.domain, available: row.available, priceInr: row.priceInr, note: "Your own idea" },
    ]);
    if (row.available === true) {
      setUserPickedDomain(true);
      setChosenDomain(allDomains.length);
    }
    setOwnInput("");
  }
  const mailboxCount = Math.max(reveal.mailboxes.length, answeredMailboxes ?? 0);

  const surfaces: FeatureSurface[] = showSite ? ["mail", "site"] : ["mail"];
  const features = pickFeatures(profile, surfaces);
  const rec = recommend(profile, mailboxCount);

  const neoName =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : null;

  const handoffUrl = buildHandoffUrl({
    profile,
    businessName: neoName ?? (profile.brandName as string) ?? domain.name.split(".")[0],
    businessDescription: businessText ?? "",
    neoIndustryKey: neoSite?.industryKey,
  });

  const liveAvail = live[domain.name]?.available ?? domain.available;
  const livePrice = live[domain.name]?.priceInr ?? domain.priceInr;
  const locals = reveal.mailboxes.map((m) => m.address.split("@")[0]).filter(Boolean);

  return (
    <div className="reveal-page">
      <div className="reveal-split">
        <section className="reveal-setup">
          <p className="eyebrow">Your setup</p>

          <p className="reveal-label">Recommended domain</p>
          <div className="domain">
            <span className="domain-name">{domain.name}</span>
            {liveAvail === true && <span className="badge">Available</span>}
            {live[domain.name]?.available === false && (
              <span className="badge badge-taken">Taken</span>
            )}
            {livePrice !== null && (
              <span className="domain-price">
                ~₹{livePrice.toLocaleString("en-IN")}/yr
                <span className="price-caveat">approx</span>
              </span>
            )}
          </div>

          {allDomains.length > 1 && (
            <div className="alts" role="group" aria-label="Choose a domain">
              {allDomains.map((d, i) => {
                const active = i === chosenDomain;
                const taken = live[d.name]?.available === false;
                const price = live[d.name]?.priceInr ?? d.priceInr;
                return (
                  <button
                    key={d.name}
                    className={`alt${active ? " alt-active" : ""}`}
                    onClick={() => {
                      unlockSound();
                      playSound("select");
                      setUserPickedDomain(true);
                      setChosenDomain(i);
                    }}
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

          <div className="reveal-block reveal-block-tight">
            <p className="reveal-label">Your mailboxes</p>
            {reveal.mailboxes.map((m) => (
              <div key={m.address} className="mailbox">
                <span className="mailbox-address">
                  {m.address.split("@")[0]}
                  <span className="mailbox-domain">@{domain.name}</span>
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
            <p className="plan-why">{rec.rationale}</p>
            <p className="plan-meta">
              {CYCLE_LABEL[rec.cycle]} · cancel anytime · you finish the site in Neo's builder
            </p>
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
                  void navigator.clipboard?.writeText(domain.name).catch(() => {});
                }}
              >
                Claim it and start building
              </a>
              <button className="btn btn-ghost" onClick={onRestart}>
                Start over
              </button>
            </div>
          </div>
        </section>

        <SetupStory
          domain={domain.name}
          locals={locals}
          showSite={showSite}
          neoSite={neoSite}
          businessText={businessText}
        />
      </div>

      <div className="reveal-below">
        {showSite && (
          <div className="reveal-block">
            <p className="reveal-label">Your site, generated by Neo</p>
            {neoSite ? <NeoSitePreview site={neoSite} delay={0} /> : <NeoSiteGenerating />}
          </div>
        )}

        {features.length > 0 && (
          <div className="reveal-block">
            <p className="reveal-label">Why this shape, for you</p>
            {features.map((f) => (
              <div key={f.id} className="feature">
                <span className="feature-name">{f.name}</span>
                <span className="feature-because">— {f.because}</span>
              </div>
            ))}
          </div>
        )}

        <p className="plan-meta plan-note">
          We'll copy {domain.name} for you — Neo's domain purchase is coming, so for now
          you'll connect it under "use a domain I own".
          {domain.note ? ` ${domain.note}` : ""}
        </p>
      </div>
    </div>
  );
}
