import type { NeoSite } from "../lib/neoSite";
import { block as blockData } from "../lib/neoSite";

/**
 * Right-hand visual story on the reveal. Inspired by Mailchimp/Rinda recommenders
 * (docs/competitor-qualification.md): show what you get, not a wall of feature text.
 * CSS loops only — there are no committed GIFs in the repo.
 */

export default function SetupStory({
  domain,
  locals,
  showSite,
  neoSite,
  businessText,
}: {
  domain: string;
  locals: string[];
  showSite: boolean;
  neoSite: NeoSite | null;
  businessText: string;
}) {
  const title =
    neoSite && typeof (blockData(neoSite, "header") as { title?: unknown })?.title === "string"
      ? ((blockData(neoSite, "header") as { title: string }).title)
      : domain.split(".")[0];
  const snippet = businessText.trim().slice(0, 72) || "what you do";
  const boxes = (locals.length ? locals : ["hello", "contact"]).slice(0, 3);

  return (
    <aside className="setup-story" aria-label="What you get">
      {showSite && (
        <article className="story-card">
          <p className="story-kicker">AI-powered site builder</p>
          <div className="story-flow" aria-hidden="true">
            <div className="story-chip">{snippet}</div>
            <span className="story-arrow">→</span>
            <div className="story-browser">
              <i />
              <i />
              <i />
              <strong>{title}</strong>
            </div>
          </div>
        </article>
      )}

      <article className="story-card">
        <p className="story-kicker">Multi-account support</p>
        <ul className="story-mail">
          {boxes.map((local, i) => (
            <li key={local} style={{ animationDelay: `${0.15 * i}s` }}>
              <span>
                {local}@{domain}
              </span>
            </li>
          ))}
        </ul>
      </article>

      <article className="story-card">
        <p className="story-kicker">Professional business email</p>
        <div className="story-swap" aria-hidden="true">
          <span className="story-from">
            {domain.split(".")[0]}@gmail.com
          </span>
          <span className="story-arrow">↓</span>
          <span className="story-to">hello@{domain}</span>
        </div>
      </article>

      {showSite && (
        <article className="story-card story-card-trio">
          <p className="story-kicker">Domain + email + website</p>
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
