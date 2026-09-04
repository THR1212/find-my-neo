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
    /**
     * DRIVEN BY THE FEATURES WE ARE JUSTIFYING, not by a separate ranking of the footage.
     *
     * `clipsFor` used to choose the films on its own, so the two halves of the screen argued.
     * A real run (cz3npnaz, 16:45) justified Campaign Mode, Read Receipts and Multi-account
     * Support on the left while the right played Neo Bookings, Neo Mail apps and Email
     * Designer — one overlap out of three, and the two most prominent films were for things
     * nobody was being sold.
     *
     * Now every highlighted feature brings its own media: its film if Neo shot one and this
     * plan grants it, otherwise the per-feature artwork from the pricing page. Left and right
     * cannot disagree, because there is only one list.
     *
     * A feature with neither is dropped rather than rendered as an empty box, and the stack
     * sizes to what is left so the rest grow into the space.
     */
    const legalFilms = clipsFor(profile, mailPlanId, 99);
    const filmFor = (id: string) => legalFilms.find((c) => (c.featureId ?? c.id) === id) ?? null;
    const media = features
      .map((f) => ({ feature: f, film: filmFor(f.id), art: featureArt(f.id) }))
      .filter((m) => m.film || m.art)
      .slice(0, 3);
    const planLabel = mailPlanName ?? "your plan";

    return (
      <aside className="setup-story setup-story-mail" aria-label="What comes with your mail">
        <p className="story-kicker">On {planLabel}</p>
        <div className={`loop-stack loop-stack-${Math.max(1, media.length)}`}>
          {media.map(({ feature, film, art }) =>
            film ? (
              <NeoProductLoop key={feature.id} clip={film} />
            ) : (
              <figure key={feature.id} className="mail-feature-card">
                <div className="mail-feature-art">
                  <img src={art!} alt="" loading="lazy" />
                </div>
                <figcaption>
                  <span className="neo-loop-name">{feature.name}</span>
                  <span className="neo-loop-caption">{feature.because}</span>
                </figcaption>
              </figure>
            ),
          )}
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
