import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import NeoProductLoop from "./NeoProductLoop";
import { clipsFor } from "../lib/neoMedia";
import { pickHero, type NeoSite } from "../lib/neoSite";

/**
 * Right pane.
 *
 * Email+site: two full generator snapshots side by side (chrome, hero, copy, CTA,
 * products, footer) — both from Neo's AI site builder for this business.
 * Mail only: product films for features this mail plan actually includes.
 */
export default function SetupStory({
  showSite,
  neoSite,
  neoSiteAlt = null,
  profile = {},
  mailPlanId = null,
  mailPlanName = null,
}: {
  domain: string;
  showSite: boolean;
  neoSite: NeoSite | null;
  neoSiteAlt?: NeoSite | null;
  profile?: Record<string, unknown>;
  mailPlanId?: string | null;
  mailPlanName?: string | null;
}) {
  if (!showSite) {
    const clips = clipsFor(profile, mailPlanId, 3);
    const planLabel = mailPlanName ?? "your plan";
    return (
      <aside className="setup-story setup-story-mail" aria-label="What comes with your mail">
        <p className="story-kicker">On {planLabel}</p>
        <div className={`loop-stack loop-stack-${clips.length}`}>
          {clips.map((clip) => (
            <NeoProductLoop key={clip.id} clip={clip} />
          ))}
        </div>
      </aside>
    );
  }

  const sites = [neoSite, neoSiteAlt ?? (neoSite ? neoSite : null)].filter(
    (s): s is NeoSite => s != null,
  );
  const firstHero = sites[0] ? pickHero(sites[0], "landing") : null;

  return (
    <aside className="setup-story setup-story-site" aria-label="Site preview">
      <p className="story-kicker">AI-powered site builder</p>
      <div className="tpl-pair">
        <div className="tpl-pane">
          {sites[0] ? (
            <NeoSitePreview site={sites[0]} delay={0} />
          ) : (
            <NeoSiteGenerating />
          )}
        </div>
        <div className="tpl-pane">
          {sites[1] ? (
            <NeoSitePreview
              site={sites[1]}
              avoidHero={firstHero}
              fallbackSite={sites[0]}
              delay={0.08}
            />
          ) : (
            <NeoSiteGenerating />
          )}
        </div>
      </div>
    </aside>
  );
}
