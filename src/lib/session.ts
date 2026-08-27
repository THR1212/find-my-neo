/**
 * Shared shapes for what the model returns.
 *
 * The flow's state now lives in engine.ts (profile + asked questions) — this file is only
 * the contract for the profile/reveal payload, so the replay fixture and the live API route
 * agree on one shape.
 */

/** What the free-text answer alone gives us, before any question is asked. */
export interface Profile {
  /** Short human label the guess screen reflects back, e.g. "a two-person bakery in Bandra". */
  summary: string;
  /** Normalised industry. Neo's own field has 5,318 distinct raw values — this is the fix. */
  industry: string;
  teamSize: number | null;
  location: string | null;
  /** Suggested domain stem, slugified, no TLD. */
  domainStem: string;
  suggestedMailboxes: string[];
}

export interface Mailbox {
  address: string;
  label: string;
}

/** A domain candidate. Alternates carry their own price — TLDs are not priced alike. */
export interface DomainOption {
  name: string;
  available: boolean;
  priceInr: number | null;
  /** Why this one is worth considering. Shown only on alternates. */
  note?: string;
  recommended?: boolean;
}

export interface RevealContent {
  domains: DomainOption[];
  mailboxes: Mailbox[];
  site: {
    headline: string;
    subhead: string;
    sections: string[];
  };
}
