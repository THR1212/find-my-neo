import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import NeoProductLoop from "./NeoProductLoop";
import NeoTemplateShots from "./NeoTemplateShots";
import type { NeoSite } from "../lib/neoSite";
import { clipsFor } from "../lib/neoMedia";

/**
 * Right pane.
 *
 * Two different jobs, decided by what they asked for:
 *   site + mail -> two big templates side by side: Neo's generated site, and one other look
 *   mail only   -> product films for features THIS mail plan actually includes
 *
 * The films used to rank by profile only, so a Starter recommendation could loop Invoice
 * Builder (Max-only). Entitlement is now the hard filter — see clipsFor / plan-features.json.
 */
export default function SetupStory({
  domain,
  showSite,
  neoSite,
  profile = {},
  mailPlanId = null,
  mailPlanName = null,
}: {
  domain: string;
  showSite: boolean;
  neoSite: NeoSite | null;
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

  return (
    <aside className="setup-story setup-story-site" aria-label="Site preview">
      <p className="story-kicker">AI-powered site builder</p>
      <div className="tpl-pair">
        <div className="tpl-pane tpl-pane-generated">
          {neoSite ? <NeoSitePreview site={neoSite} delay={0} /> : <NeoSiteGenerating />}
          <p className="tpl-pane-caption">Generated for you</p>
        </div>
        <NeoTemplateShots seed={domain} />
      </div>
    </aside>
  );
}
