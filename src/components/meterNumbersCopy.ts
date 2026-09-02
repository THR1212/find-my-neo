/**
 * Layperson labels for the numbers meter. The count is still remaining(); this only
 * names *what* those matches have in common after the last screen they completed.
 *
 * Guess (free text) → businesses like yours
 * After a question → the last answer, in plain English
 * Reveal → setups that fit you
 *
 * Cutoffs and counts still come from the engine. Do not invent a remaining figure here.
 */

export type MeterStage = "hook" | "describe" | "guess" | "question" | "reveal";

/** Engine profile values may be scalar or arrays (multi-select). */
export type MeterProfile = Record<string, string | number | boolean | null | string[] | undefined>;

function scalar(profile: MeterProfile, key: string): string | number | boolean | undefined {
  const v = profile[key];
  if (v == null) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
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
      return many(n, "who is bringing contacts", "who are bringing contacts");
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
  if (teamSize === 2) return many(n, "two-person team like yours", "two-person teams like yours");
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

/**
 * @param lastQuestionId the question they just left (engine.asked tail), not the one on screen
 */
export function numbersMeterLabel(
  remaining: number,
  stage: MeterStage,
  lastQuestionId: string | null,
  profile: MeterProfile,
): string {
  if (stage === "reveal") {
    return remaining === 1 ? "setup that fits you" : "setups that fit you";
  }

  if (stage === "guess" || !lastQuestionId) {
    return remaining === 1 ? "business like yours" : "businesses like yours";
  }

  switch (lastQuestionId) {
    case "channel":
      return afterChannel(remaining, scalar(profile, "customerChannel") as string | undefined);
    case "import":
      return afterImport(remaining, scalar(profile, "importIntent") as string | undefined);
    case "client":
      return afterClient(remaining, scalar(profile, "currentClient") as string | undefined);
    case "surface":
      return afterSurface(remaining, scalar(profile, "surface") as string | undefined);
    case "team":
      return afterTeam(remaining, scalar(profile, "teamSize") as number | undefined);
    case "sells":
      return afterSells(remaining, scalar(profile, "sellsOnline") as boolean | undefined);
    default:
      return remaining === 1 ? "match like yours" : "matches like yours";
  }
}
