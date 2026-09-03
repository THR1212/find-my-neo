import NeoSitePreview from "./NeoSitePreview";
import NeoSiteGenerating from "./NeoSiteGenerating";
import NeoProductLoop from "./NeoProductLoop";
import { clipsFor, featureArt } from "../lib/neoMedia";
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
  features = [],
  chosenTemplate = null,
  onChooseTemplate,
}: {
  domain: string;
  showSite: boolean;
  neoSite: NeoSite | null;
  neoSiteAlt?: NeoSite | null;
  profile?: Record<string, unknown>;
  mailPlanId?: string | null;
  mailPlanName?: string | null;
  /** The bullets the reveal is already showing, so the mail pane can echo them. */
  features?: { id: string; name: string; because: string }[];
  /** `templateKey` of the pane they picked, or null while neither is chosen. */
  chosenTemplate?: string | null;
  onChooseTemplate?: (templateKey: string) => void;
}) {
  if (!showSite) {
    const clips = clipsFor(profile, mailPlanId, 3);
    const planLabel = mailPlanName ?? "your plan";
    /**
     * FILL THE REST WITH THE FEATURES WE ACTUALLY HIGHLIGHTED.
     *
     * `MAIL_CLIPS` holds five films and FOUR are gated at Standard or Max, so `clipsFor`
     * legitimately returns exactly one on Starter — and the pane rendered that single clip at
     * full height. A mail-only Starter reveal was one enormous phone animation next to a
     * ₹149 plan, which is the cheapest plan getting the loudest pane.
     *
     * The entitlement filter is right and must stay: a Max-only film beside a Starter price
     * promises something they have not bought. The gap is in the footage, not the rule. So
     * the remaining slots take the same feature bullets the plan card is showing — real,
     * plan-correct, and already on screen in text.
     *
     * Any clip that exists still wins its slot; this only fills what would otherwise stretch.
     */
    /* Match on `featureId` as well as `id`: this file's clips are named after the footage
       (`fast_apps`, `signature`) and features.ts after Pandora entitlements
       (`multi_device_support`, `signature_builder`). Only `invoice_builder` matches by id, so
       an id-only check would show the Signature Designer card under the Signature Designer
       film. */
    const filmed = new Set(clips.flatMap((c) => [c.id, c.featureId ?? c.id]));
    const shown = features.filter((f) => !filmed.has(f.id)).slice(0, 3 - clips.length);
    return (
      <aside className="setup-story setup-story-mail" aria-label="What comes with your mail">
        <p className="story-kicker">On {planLabel}</p>
        <div className={`loop-stack loop-stack-${Math.max(1, clips.length + shown.length)}`}>
          {clips.map((clip) => (
            <NeoProductLoop key={clip.id} clip={clip} />
          ))}
          {shown.map((f) => (
            <figure key={f.id} className="mail-feature-card">
              {/* Neo's own artwork for this entitlement, several of which are animated. Null
                  for the few with no asset in their set — a card with no picture beats a
                  borrowed one, which is the same rule the site generator follows. */}
              {featureArt(f.id) && (
                <div className="mail-feature-art">
                  <img src={featureArt(f.id)!} alt="" loading="lazy" />
                </div>
              )}
              <figcaption>
                <span className="neo-loop-name">{f.name}</span>
                <span className="neo-loop-caption">{f.because}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </aside>
    );
  }

  const sites = [neoSite, neoSiteAlt ?? (neoSite ? neoSite : null)].filter(
    (s): s is NeoSite => s != null,
  );
  const firstHero = sites[0] ? pickHero(sites[0], "landing") : null;

  /**
   * PICKABLE, and this is the point of showing two.
   *
   * docs/neo-product-facts.md records Neo choosing the template RANDOMLY client-side — the
   * same bakery came back `fashion_store`, then `property` ("Real Estate"), then `bio_site`
   * across three runs, and the bike shop in testing got "Logistics". Two panes only make that
   * visible; letting someone pick is what answers it, because the choice rides to Neo as
   * `templateKey` instead of being re-rolled there.
   *
   * Buttons, not divs with handlers: this is a choice between two options and it has to be
   * reachable by keyboard like the domain pills already are.
   */
  const pane = (site: NeoSite | null, opts: { alt?: boolean; delay: number }) => {
    if (!site) {
      return (
        <div className="tpl-pane">
          <NeoSiteGenerating />
        </div>
      );
    }
    const chosen = chosenTemplate === site.templateKey;
    return (
      <button
        type="button"
        className={`tpl-pane tpl-pane-pick${chosen ? " tpl-pane-chosen" : ""}`}
        aria-pressed={chosen}
        onClick={() => onChooseTemplate?.(site.templateKey)}
      >
        <NeoSitePreview
          site={site}
          {...(opts.alt ? { avoidHero: firstHero, fallbackSite: sites[0] } : {})}
          delay={opts.delay}
        />
        <span className="tpl-pick-badge">{chosen ? "Chosen" : "Use this one"}</span>
      </button>
    );
  };

  return (
    <aside className="setup-story setup-story-site" aria-label="Site preview">
      <p className="story-kicker">AI-powered site builder — pick the look you want</p>
      <div className="tpl-pair">
        {pane(sites[0] ?? null, { delay: 0 })}
        {pane(sites[1] ?? null, { alt: true, delay: 0.08 })}
      </div>
    </aside>
  );
}
