import { useEffect, useRef, useState } from "react";
import type { DomainOption, RevealContent } from "../lib/session";
import { availableFromLookup, lookupDomains, type DomainInfo } from "../lib/domains";
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
 * Locked-viewport reveal. Squarespace Blueprint / Wix ADI / Linear-settings pattern:
 * the page does not scroll; left is the recommendation, right is a live preview pane.
 * Taken domains never appear — availableFromLookup drops them (Darrel, 3 Sep).
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
      { name: row.domain, available: true, priceInr: row.priceInr, note: "Your own idea" },
    ]);
    setChosenName(row.domain);
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
    businessName:
      neoName ?? (profile.brandName as string) ?? domain?.name.split(".")[0] ?? "your business",
    businessDescription: businessText ?? "",
    neoIndustryKey: neoSite?.industryKey,
  });

  const liveAvail = domain ? (live[domain.name]?.available ?? domain.available) : null;
  const livePrice = domain ? (live[domain.name]?.priceInr ?? domain.priceInr) : null;
  const locals = reveal.mailboxes.map((m) => m.address.split("@")[0]).filter(Boolean);
  const domainName = domain?.name ?? `${stem || "yourbusiness"}.com`;

  return (
    <div className="reveal-page">
      <div className="reveal-split">
        <section className="reveal-setup">
          <p className="eyebrow">Your setup</p>

          <p className="reveal-label">Recommended domain</p>
          {domain ? (
            <div className="domain">
              <span className="domain-name">{domain.name}</span>
              {liveAvail === true && <span className="badge">Available</span>}
              {livePrice !== null && (
                <span className="domain-price">
                  ~₹{livePrice.toLocaleString("en-IN")}/yr
                  <span className="price-caveat">approx</span>
                </span>
              )}
            </div>
          ) : (
            <p className="domain-note">Every name we tried is taken. Check one of yours below.</p>
          )}

          {allDomains.length > 1 && (
            <div className="alts" role="group" aria-label="Choose a domain">
              {allDomains.map((d) => {
                const active = d.name === (domain?.name ?? chosenName);
                const price = live[d.name]?.priceInr ?? d.priceInr;
                return (
                  <button
                    key={d.name}
                    className={`alt${active ? " alt-active" : ""}`}
                    onClick={() => {
                      unlockSound();
                      playSound("select");
                      setChosenName(d.name);
                    }}
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

          <div className="reveal-block reveal-block-tight">
            <p className="reveal-label">Your mailboxes</p>
            {reveal.mailboxes.map((m) => (
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
            <p className="plan-why">{rec.rationale}</p>
            {features.length > 0 && (
              <p className="plan-meta">
                {features.map((f) => f.name).join(" · ")}
              </p>
            )}
            <p className="plan-meta">
              {CYCLE_LABEL[rec.cycle]} · cancel anytime
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
                  void navigator.clipboard?.writeText(domainName).catch(() => {});
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
          domain={domainName}
          locals={locals}
          showSite={showSite}
          neoSite={neoSite}
        />
      </div>
    </div>
  );
}
