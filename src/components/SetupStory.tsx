import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import type { NeoSite } from "../lib/neoSite";
import { block as blockData } from "../lib/neoSite";

/**
 * Right pane of a locked-viewport reveal — Squarespace Blueprint / Wix ADI:
 * the generated site fills the pane; a thin identity strip sits under it.
 * No page scroll: this column is overflow:hidden and the site card scales to fit.
 */

export default function SetupStory({
  domain,
  locals,
  showSite,
  neoSite,
}: {
  domain: string;
  locals: string[];
  showSite: boolean;
  neoSite: NeoSite | null;
}) {
  const title =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : domain.split(".")[0];
  const boxes = (locals.length ? locals : ["hello", "contact"]).slice(0, 3);

  return (
    <aside className="setup-story" aria-label="What you get">
      {showSite ? (
        <div className="reveal-preview">
          <p className="story-kicker">AI-powered site builder</p>
          {neoSite ? <NeoSitePreview site={neoSite} delay={0} /> : <NeoSiteGenerating />}
        </div>
      ) : (
        <article className="story-card story-card-trio">
          <p className="story-kicker">Domain + email</p>
          <div className="story-trio" aria-hidden="true">
            <span>{domain}</span>
            <span>hello@{domain}</span>
            <span>{title}</span>
          </div>
        </article>
      )}

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
    </aside>
  );
}
