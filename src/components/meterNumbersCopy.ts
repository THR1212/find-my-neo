/**
 * Words on the narrowing meter. The ring still tracks confidence(); this only names
 * *who they are like* after the last thing they told us.
 *
 * Prefer the model-written `meter` line on each option (and `meterGuess` on the guess
 * screen). Those are generated for this business. Missing lines fall back to the
 * industry + option phrases below. Never a count, never a price.
 */

import type { SurfaceMap } from "../lib/questions";

export type MeterStage = "hook" | "describe" | "guess" | "question" | "reveal";

export type MeterCopyContext = {
  surface?: SurfaceMap;
  pickedOptionIds?: string[];
  /** Question on screen — used so the meter updates as they tap, not only after Continue. */
  currentQuestionId?: string | null;
  liveOptionIds?: string[];
  meterGuess?: string;
};

function generatedLines(
  questionId: string | null,
  optionIds: string[] | undefined,
  ctx?: MeterCopyContext,
): string[] {
  if (!questionId || !optionIds?.length || !ctx?.surface) return [];
  const options = ctx.surface[questionId]?.options;
  if (!options) return [];
  const lines: string[] = [];
  for (const id of optionIds) {
    const line = options[id]?.meter?.trim();
    if (line && !lines.includes(line)) lines.push(line);
  }
  return lines;
}

/**
 * Compatible with engine Profile without importing lib.
 * Values may be scalar or arrays (multi-select).
 */
export type MeterProfile = Record<
  string,
  string | number | boolean | null | string[] | undefined
>;

type MeterValue = MeterProfile[string];

/** Same idea as engine has() — arrays from multi-select must still match. */
function has(profile: MeterProfile, key: string, value: unknown): boolean {
  const v = profile[key];
  return Array.isArray(v) ? v.includes(value as string) : v === value;
}

function first(value: MeterValue): string | number | boolean | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickString(profile: MeterProfile, key: string, preferred: string[]): string | undefined {
  for (const option of preferred) {
    if (has(profile, key, option)) return option;
  }
  const head = first(profile[key]);
  return typeof head === "string" ? head : undefined;
}

function many(n: number, one: string, more: string) {
  return n === 1 ? one : more;
}

function afterChannel(n: number, channel: string | undefined) {
  switch (channel) {
    case "social":
      return many(n, "who sells on DMs like you", "who sell on DMs like you");
    case "personal_email":
      return many(n, "who uses a personal inbox", "who use a personal inbox");
    case "offline":
      return many(n, "who sells in person like you", "who sell in person like you");
    case "site":
      return many(n, "who already has a website", "who already have a website");
    default:
      return many(n, "who sells the way you do", "who sell the way you do");
  }
}

function afterImport(n: number, intent: string | undefined) {
  switch (intent) {
    case "none":
      return many(n, "who is starting fresh", "who are starting fresh");
    case "emails":
      return many(n, "who is bringing their mail", "who are bringing their mail");
    case "both":
      return many(n, "who is moving mail and contacts", "who are moving mail and contacts");
    case "contacts":
      return many(n, "who is bringing contacts", "who are bringing their contacts");
    default:
      return many(n, "who is setting up mail like you", "who are setting up mail like you");
  }
}

function afterClient(n: number, client: string | undefined) {
  switch (client) {
    case "gmail":
      return many(n, "who uses Gmail today", "who use Gmail today");
    case "outlook":
      return many(n, "who uses Outlook today", "who use Outlook today");
    case "apple":
      return many(n, "who uses Apple Mail today", "who use Apple Mail today");
    case "none":
      return many(n, "who has no mail yet", "who have no mail yet");
    default:
      return many(n, "who uses the same inbox", "who use the same inbox");
  }
}

function afterSurface(n: number, surface: string | undefined) {
  if (surface === "mail") {
    return many(n, "who needs email first", "who need email first");
  }
  if (surface === "both") {
    return many(n, "who wants mail and a site", "who want mail and a site");
  }
  return many(n, "who needs the same setup", "who need the same setup");
}

function afterTeam(n: number, teamSize: number | undefined) {
  if (teamSize === 1) return many(n, "one-person setup", "one-person setups");
  if (teamSize === 2) return many(n, "two-address setup like yours", "two-address setups like yours");
  if (teamSize && teamSize <= 5) return many(n, "small team like yours", "small teams like yours");
  if (teamSize && teamSize > 5) return many(n, "bigger team like yours", "bigger teams like yours");
  return many(n, "team like yours", "teams like yours");
}

function afterSells(n: number, sellsOnline: boolean | undefined) {
  if (sellsOnline === true) {
    return many(n, "who takes payments online", "who take payments online");
  }
  if (sellsOnline === false) {
    return many(n, "who takes enquiries first", "who take enquiries first");
  }
  return many(n, "who gets paid like you", "who get paid like you");
}

function teamSizeOf(profile: MeterProfile): number | undefined {
  const v = profile.teamSize ?? profile.mailboxCount;
  if (typeof v === "number") return v;
  const head = first(v);
  return typeof head === "number" ? head : undefined;
}

function sellsOnlineOf(profile: MeterProfile): boolean | undefined {
  if (has(profile, "sellsOnline", true)) return true;
  if (has(profile, "sellsOnline", false)) return false;
  return undefined;
}

type TradeVoice = { folk: string; setup: string };

const TRADE_BY_INDUSTRY: Record<string, TradeVoice> = {
  "Food & Beverage": { folk: "Food businesses", setup: "Your food setup" },
  "E-commerce & Retail": { folk: "Shops like yours", setup: "Your shop setup" },
  "Healthcare & Wellness": { folk: "Clinics like yours", setup: "Your clinic setup" },
  "Nonprofits/Social Impact & Public Services": {
    folk: "Organisations like yours",
    setup: "Your org setup",
  },
  "Nonprofits, Social Impact & Public Services": {
    folk: "Organisations like yours",
    setup: "Your org setup",
  },
  "Technology & IT Services": { folk: "Tech teams like yours", setup: "Your tech setup" },
  "Financial Services": { folk: "Finance teams like yours", setup: "Your finance setup" },
  "Logistics & Automotive": { folk: "Trade businesses", setup: "Your trade setup" },
  "Media & Entertainment": { folk: "Venues like yours", setup: "Your venue setup" },
  "Arts & Creative Services": { folk: "Studios like yours", setup: "Your studio setup" },
  "Education & Training": { folk: "Teachers like you", setup: "Your teaching setup" },
  "Professional & Business Services": { folk: "Practices like yours", setup: "Your practice setup" },
  "Marketing & Advertising": { folk: "Agencies like yours", setup: "Your agency setup" },
  "Travel & Hospitality": { folk: "Hosts like yours", setup: "Your host setup" },
  "Recreation & Sports": { folk: "Clubs like yours", setup: "Your club setup" },
  "Manufacturing & Industrial": { folk: "Makers like yours", setup: "Your workshop setup" },
  /* NOT "Your site setup". A building site is not a website, but this product uses "site" to
     mean exactly one thing on every other screen — and a locksmith who had just answered
     "Just email, no website" was shown "Your site setup" on the reveal. The one word we cannot
     borrow for a second meaning is the one already load-bearing in our own vocabulary. */
  Construction: { folk: "Builders like yours", setup: "Your trade setup" },
};

function tradeVoice(profile: MeterProfile): TradeVoice {
  const raw = first(profile.industry);
  if (typeof raw === "string" && TRADE_BY_INDUSTRY[raw]) return TRADE_BY_INDUSTRY[raw];
  return { folk: "Businesses like yours", setup: "Your setup" };
}

function fallbackSituation(
  remaining: number,
  questionId: string | null,
  profile: MeterProfile,
): string | undefined {
  if (!questionId) return undefined;
  switch (questionId) {
    case "channel":
      return afterChannel(
        remaining,
        pickString(profile, "customerChannel", ["social", "personal_email", "offline", "site"]),
      );
    case "import":
      return afterImport(
        remaining,
        pickString(profile, "importIntent", ["none", "emails", "both", "contacts"]),
      );
    case "client":
      return afterClient(
        remaining,
        pickString(profile, "currentClient", ["gmail", "outlook", "apple", "none"]),
      );
    case "surface":
      return afterSurface(remaining, pickString(profile, "surface", ["mail", "both"]));
    case "team":
      return afterTeam(remaining, teamSizeOf(profile));
    case "sells":
      return afterSells(remaining, sellsOnlineOf(profile));
    default:
      return remaining === 1 ? "match like yours" : "matches like yours";
  }
}

function situationFromPicks(
  questionId: string | null,
  optionIds: string[] | undefined,
  profile: MeterProfile,
  ctx?: MeterCopyContext,
): string | undefined {
  const generated = generatedLines(questionId, optionIds, ctx);
  if (generated.length === 1) return generated[0];
  if (generated.length > 1) return generated.slice(0, 2).join(" · ");
  if (!optionIds?.length) return undefined;
  return fallbackSituation(99, questionId, profile);
}

/** Model lines often start with "who …". Headline the trade; keep the rest as the sub. */
function pairSituation(folk: string, situation: string): { title: string; sub: string } {
  const line = situation.trim();
  const who = line.match(/^who\s+(.+)$/i);
  if (who) return { title: folk, sub: who[1] };
  if (line.toLowerCase().includes(folk.split(" ")[0].toLowerCase())) {
    return { title: line, sub: "getting more specific" };
  }
  return { title: line, sub: folk };
}

function activeQuestionId(
  lastQuestionId: string | null,
  ctx?: MeterCopyContext,
): string | null {
  const liveIds = ctx?.liveOptionIds ?? [];
  if (liveIds.length && ctx?.currentQuestionId) return ctx.currentQuestionId;
  return lastQuestionId ?? ctx?.currentQuestionId ?? null;
}

/**
 * @param lastQuestionId the question they just left (engine.asked tail), not the one on screen
 */
export function numbersMeterLabel(
  remaining: number,
  stage: MeterStage,
  lastQuestionId: string | null,
  profile: MeterProfile,
  ctx?: MeterCopyContext,
): string {
  if (stage === "reveal") return "ready for you";
  if (stage === "guess") {
    return ctx?.meterGuess?.trim() || (remaining === 1 ? "business like yours" : "businesses like yours");
  }
  const liveIds = ctx?.liveOptionIds ?? [];
  const questionId = activeQuestionId(lastQuestionId, ctx);
  const optionIds = liveIds.length ? liveIds : ctx?.pickedOptionIds;
  return (
    situationFromPicks(questionId, optionIds, profile, ctx) ??
    fallbackSituation(remaining, questionId, profile) ??
    (remaining === 1 ? "match like yours" : "matches like yours")
  );
}

/** Number-free headline from the last answer. Always plural — we are not claiming a count. */
export function wordsMeterCopy(
  stage: MeterStage,
  lastQuestionId: string | null,
  profile: MeterProfile,
  ctx?: MeterCopyContext,
): { title: string; sub: string } {
  const { folk, setup } = tradeVoice(profile);

  if (stage === "hook" || stage === "describe") {
    return { title: "Finding your setup", sub: "start with what you do" };
  }

  if (stage === "reveal") {
    return { title: setup, sub: "ready for you" };
  }

  if (stage === "guess") {
    const guess = ctx?.meterGuess?.trim();
    if (guess) return { title: folk, sub: guess };
    return { title: "Finding your setup", sub: "from what you do" };
  }

  const liveIds = ctx?.liveOptionIds ?? [];
  const questionId = activeQuestionId(lastQuestionId, ctx);
  const optionIds = liveIds.length ? liveIds : ctx?.pickedOptionIds;
  const situation = situationFromPicks(questionId, optionIds, profile, ctx);

  if (!situation) {
    const guess = ctx?.meterGuess?.trim();
    if (guess) return { title: folk, sub: guess };
    return { title: folk, sub: "getting more specific" };
  }
  return pairSituation(folk, situation);
}

export function closerMeterCopy(confidence: number): { title: string; sub: string } {
  if (confidence < 0.2) return { title: "Finding your setup", sub: "start with what you do" };
  if (confidence < 0.45) return { title: "Getting closer", sub: "that narrowed it" };
  if (confidence < 0.7) return { title: "Taking shape", sub: "a few more details" };
  if (confidence < 0.88) return { title: "Almost there", sub: "nearly locked in" };
  return { title: "Your setup", sub: "ready for you" };
}
