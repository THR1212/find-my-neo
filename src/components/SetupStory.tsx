import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import NeoProductLoop from "./NeoProductLoop";
import NeoTemplateShots from "./NeoTemplateShots";
import type { NeoSite } from "../lib/neoSite";
import { clipsFor } from "../lib/neoMedia";

/** Addresses + professional-email story, shown on the left above the plan. */
export function IdentityStrip({ domain, locals }: { domain: string; locals: string[] }) {
  const boxes = (locals.length ? locals : ["hello", "contact"]).slice(0, 3);
  return (
    <div className="story-strip">
      <article className="story-card">
        <p className="story-kicker">Addresses</p>
        <ul className="story-mail">
          {boxes.map((local) => (
            <li key={local}>
              {local}@{domain}
            </li>
          ))}
        </ul>
      </article>
      <article className="story-card">
        <p className="story-kicker">Professional email</p>
        <div className="story-swap" aria-hidden="true">
          <span className="story-from">{domain.split(".")[0]}@gmail.com</span>
          <span className="story-arrow">→</span>
          <span className="story-to">hello@{domain}</span>
        </div>
      </article>
    </div>
  );
}

/**
 * Right pane.
 *
 * Two different jobs, decided by what they asked for:
 *   site + mail -> Neo's generated site, plus two template shots underneath
 *   mail only   -> Neo's own product films for the mail bundle
 *
 * The second case used to render a three-line text card, which left the right half of a
 * locked-viewport reveal essentially empty for everyone who only wanted email. Those people
 * are not a lesser case — they are the ones buying the mail plan — so they get the same
 * amount of proof, drawn from Neo's own marketing films rather than invented.
 */
export default function SetupStory({
  domain,
  showSite,
  neoSite,
  profile = {},
}: {
  domain: string;
  showSite: boolean;
  neoSite: NeoSite | null;
  profile?: Record<string, unknown>;
}) {
  if (!showSite) {
    const clips = clipsFor(profile, 3);
    return (
      <aside className="setup-story setup-story-mail" aria-label="What comes with your mail">
        <p className="story-kicker">What comes with {domain}</p>
        <div className="loop-stack">
          {clips.map((clip) => (
            <NeoProductLoop key={clip.id} clip={clip} />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="setup-story" aria-label="Site preview">
      <div className="reveal-preview">
        <p className="story-kicker">AI-powered site builder</p>
        {neoSite ? <NeoSitePreview site={neoSite} delay={0} /> : <NeoSiteGenerating />}
      </div>
      <NeoTemplateShots seed={domain} />
    </aside>
  );
}
