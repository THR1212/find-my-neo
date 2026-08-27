/**
 * The single place the product name is defined.
 *
 * "Akinator" is a trademark (Elokence SAS) and must never render on screen, appear in the
 * deck, or land in a page title. It survives as internal shorthand and as the repo name only.
 * See docs/naming.md.
 *
 * If the PM team wants a different name after the 28 Aug demo, this is a one-line change.
 * Do not hardcode the name in a component.
 */
export const PRODUCT_NAME = "Find My Neo";

/**
 * Entry-point copy on the pricing page.
 *
 * "A few" rather than a number, on purpose. MAX_QUESTIONS is a ceiling of 4, but the engine
 * stops early once it's confident, so the real count varies by person — promising an exact
 * number we might not ask is the kind of small dishonesty someone notices.
 */
export const HOOK_COPY = "Not sure which plan? Answer a few questions";
