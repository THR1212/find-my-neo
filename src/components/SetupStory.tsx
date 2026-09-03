import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import NeoProductLoop from "./NeoProductLoop";
import { clipsFor } from "../lib/neoMedia";
import { pickHero, type NeoSite } from "../lib/neoSite";

/**
 * Right pane.
 *
 * Two different jobs, decided by what they asked for:
 *   site + mail -> two compact snapshots from Neo's site generator, this business only
 *   mail only   -> product films for features THIS mail plan actually includes
 *
 * Marketing-reel stills (other shops) never appear here. If the generator only returned
 * one site, the second card is the products look from that same site.
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

  const pair: { site: NeoSite; look: "landing" | "shop" }[] = [];
  if (neoSite) pair.push({ site: neoSite, look: "landing" });
  if (neoSiteAlt) pair.push({ site: neoSiteAlt, look: "landing" });
  else if (neoSite) pair.push({ site: neoSite, look: "shop" });

  const firstHero = pair[0] ? pickHero(pair[0].site, pair[0].look) : null;

  return (
    <aside className="setup-story setup-story-site" aria-label="Site preview">
      <p className="story-kicker">AI-powered site builder</p>
      <div className="tpl-pair">
        <div className="tpl-pane">
          {pair[0] ? (
            <NeoSitePreview site={pair[0].site} look={pair[0].look} delay={0} />
          ) : (
            <NeoSiteGenerating />
          )}
        </div>
        <div className="tpl-pane">
          {pair[1] ? (
            <NeoSitePreview
              site={pair[1].site}
              look={pair[1].look}
              avoidHero={firstHero}
              fallbackSite={pair[0].site}
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
