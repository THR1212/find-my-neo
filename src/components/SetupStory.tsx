import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import type { NeoSite } from "../lib/neoSite";
import { block as blockData } from "../lib/neoSite";

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
 * Right pane: only the generated site. Identity cards live on the left so this
 * window is not covered by the meter or crowded by extra blocks.
 */
export default function SetupStory({
  domain,
  showSite,
  neoSite,
}: {
  domain: string;
  showSite: boolean;
  neoSite: NeoSite | null;
}) {
  const title =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : domain.split(".")[0];

  return (
    <aside className="setup-story" aria-label="Site preview">
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
    </aside>
  );
}
