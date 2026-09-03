/**
 * The model gets a say in the plan — the first time it has ever affected what someone pays.
 *
 * Until now it read the description once, before a single question was answered, and
 * everything after that was deterministic. `/api/rationale` sees the whole run but only
 * EXPLAINS a decision already made. So a person could type something revealing on a
 * free-text box and it would change nothing they were charged.
 *
 * THE POWER IT HAS IS DELIBERATELY ONE-DIRECTIONAL: **it may raise a floor, never lower one.**
 *
 * `rules.ts` has already computed the cheapest setup satisfying every need, and each of those
 * needs is a Pandora entitlement — not an opinion. Letting a model go BELOW that would mean
 * recommending a plan that provably cannot do something the person said they do. Letting it go
 * ABOVE, with a reason, is exactly the case the fixed needs cannot cover: prose. "We send
 * enormous video files to clients" is a storage need that no option on any screen captured.
 *
 * And a raise is only accepted if the model NAMES THE ENTITLEMENT that requires it and QUOTES
 * what the person said. Both are checked here:
 *
 *   - the entitlement is an enum, so it cannot be invented (constrained decoding)
 *   - the floor it claims is looked up in OUR table, not taken from the model
 *   - the evidence must actually appear in what the person wrote or picked
 *
 * Fail any of those and the deterministic answer stands. The model can improve the
 * recommendation; it cannot quietly inflate it.
 */

import { complete } from "./llm.js";

type MailTier = "starter" | "standard" | "max";
type SiteTier = "none" | "basic" | "plus" | "growth";

const MAIL_TIERS: MailTier[] = ["starter", "standard", "max"];
const SITE_TIERS: SiteTier[] = ["none", "basic", "plus", "growth"];
const MAIL_RANK: Record<string, number> = { starter: 0, standard: 1, max: 2 };
const SITE_RANK: Record<string, number> = { none: 0, basic: 1, plus: 2, growth: 3 };

/**
 * What each entitlement actually requires, from `src/data/plan-features.json`.
 *
 * MIRRORS the NEEDS table in src/lib/candidates.ts and must stay in step with it — same
 * arrangement as QUESTION_SHAPE in questionService. A mismatch is safe (an unknown or
 * under-ranked citation is rejected and the deterministic plan stands) but it silently costs
 * the model the ability to justify that upgrade.
 *
 * This table is the verification. The model tells us which entitlement it is relying on; the
 * floor comes from here, never from the model.
 */
const ENTITLEMENT_FLOORS: Record<string, { mail?: MailTier; site?: SiteTier }> = {
  drive_storage: { mail: "max" },
  company_branding: { mail: "standard" },
  invoice_builder: { mail: "max" },
  email_marketing: { mail: "max" },
  appointment_booking: { mail: "max" },
  signature_builder: { mail: "max" },
  neo_site: { site: "basic" },
  contact_form: { site: "plus" },
  site_products: { site: "plus" },
  site_catalogue_unlimited: { site: "growth" },
};

const ENTITLEMENT_IDS = Object.keys(ENTITLEMENT_FLOORS);

/**
 * Which question already settles each entitlement — and therefore when the model must stay out.
 *
 * **A TAP BEATS AN INFERENCE, ALWAYS.** The first live test made this obvious: a video studio
 * whose description mentioned "enormous 4K video files every single day" had ALSO tapped
 * "Mostly just messages" on the volume question, and the model raised them Starter -> Max
 * anyway. It read the description over their explicit answer.
 *
 * That is the wrong boundary even when the inference is more plausible than the tap. Someone
 * who picks an option has answered; overriding it is telling a person we know their business
 * better than they do, and doing it in the direction that costs them money.
 *
 * So the model's power is precisely: fill gaps the QUESTIONS DID NOT COVER — a question never
 * asked, or one answered in prose that no fixed rule can read. Never contradict a choice.
 */
const ENTITLEMENT_QUESTION: Record<string, string> = {
  drive_storage: "volume",
  invoice_builder: "extras",
  email_marketing: "extras",
  appointment_booking: "extras",
  signature_builder: "channel",
  company_branding: "channel",
  neo_site: "surface",
  contact_form: "channel",
  site_products: "sells",
  site_catalogue_unlimited: "catalogue",
};

interface ModelPlan {
  mailTier: MailTier;
  siteTier: SiteTier;
  cites: { entitlement: string; evidence: string }[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mailTier", "siteTier", "cites"],
  properties: {
    mailTier: { type: "string", enum: MAIL_TIERS },
    siteTier: { type: "string", enum: SITE_TIERS },
    cites: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entitlement", "evidence"],
        properties: {
          entitlement: { type: "string", enum: ENTITLEMENT_IDS },
          evidence: {
            type: "string",
            description:
              "A short phrase COPIED from what the person wrote or picked. Not a paraphrase " +
              "and not your own words — it is checked against their text.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "A small business has described itself and answered a few questions. Deterministic code has",
  "already worked out the cheapest plan that meets every requirement it could detect from the",
  "options they picked. You are given that plan.",
  "",
  "Your job is narrow: decide whether anything they SAID IN THEIR OWN WORDS reveals a",
  "requirement the fixed questions did not capture. Almost always the answer is no, and you",
  "should return the plan exactly as given with no citations. That is the correct outcome and",
  "it is the common one.",
  "",
  "YOU MAY ONLY RAISE A TIER, NEVER LOWER ONE. The plan you were given already satisfies",
  "everything detected. Going lower would recommend something that provably cannot do what",
  "they said they do.",
  "",
  "To raise a tier you must cite the entitlement that requires it AND quote the words that",
  "show they need it. Copy their phrase exactly; a paraphrase is rejected. These are the only",
  "entitlements you may cite, and what each one requires:",
  "  drive_storage             large files / heavy attachments  -> mail max",
  "  invoice_builder           sending quotes or invoices       -> mail max",
  "  email_marketing           messaging customers as a group   -> mail max",
  "  appointment_booking       people booking time with them    -> mail max",
  "  company_branding          moving off a personal address    -> mail standard",
  "  signature_builder         wants a designed signature       -> mail max",
  "  neo_site                  wanting a website at all         -> site basic",
  "  contact_form              needing enquiries from the site  -> site plus",
  "  site_products             listing products or services     -> site plus",
  "  site_catalogue_unlimited  hundreds of listings             -> site growth",
  "",
  "Raising someone's plan costs them real money every month. Do it only when their own words",
  "make the requirement unambiguous — not because a business of their type often needs it, and",
  "not because a feature would be nice to have. If they did not say it, it did not happen.",
  "",
  "AND NEVER CONTRADICT AN ANSWER THEY GAVE. If they were asked what they send and picked",
  "'Mostly just messages', that is the answer even if their description sounds heavier. You",
  "are filling gaps the questions did not cover, not correcting the person about their own",
  "business. A citation on a question they already answered will be rejected.",
].join("\n");

export interface PlanInput {
  businessText?: unknown;
  /** What they were asked and what they answered, including anything typed. */
  answers?: { question?: unknown; answer?: unknown }[];
  /**
   * Question ids answered by TAPPING an option, as opposed to unasked or typed.
   *
   * The model may not cite an entitlement whose question is in here — see ENTITLEMENT_QUESTION.
   */
  answeredByTap?: unknown;
  /** The deterministic recommendation. The floor the model may raise from. */
  mailTier?: unknown;
  siteTier?: unknown;
}

/** Does `evidence` actually appear in what this person said? Loose, but not a rubber stamp. */
function evidenceIsReal(evidence: string, haystack: string): boolean {
  const needle = evidence.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (needle.length < 4) return false;
  const hay = haystack.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
  if (hay.includes(needle)) return true;
  /* Allow a quote that drops a filler word, but require most of it to be present — the point
     is to reject invented evidence, not to punish a dropped "the". */
  const words = needle.split(" ").filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.75;
}

export async function handlePlan(
  input: PlanInput | undefined,
  sid = "none",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  const businessText = String(input?.businessText ?? "").slice(0, 2000);
  const baseMail = String(input?.mailTier ?? "starter") as MailTier;
  const baseSite = String(input?.siteTier ?? "none") as SiteTier;

  if (!MAIL_TIERS.includes(baseMail) || !SITE_TIERS.includes(baseSite)) {
    return { status: 400, body: { error: "unknown base tier" } };
  }

  const answers = (Array.isArray(input?.answers) ? input.answers : [])
    .slice(0, 12)
    .map((a) => ({
      question: String(a?.question ?? "").slice(0, 120),
      answer: String(a?.answer ?? "").slice(0, 200),
    }))
    .filter((a) => a.question);

  /* Everything the person actually said, for checking quotes against. */
  const saidByThem = [businessText, ...answers.map((a) => a.answer)].join(" \n ");

  let out: ModelPlan | undefined;
  let reason = "";
  try {
    out = await complete<ModelPlan>({
      key: "plan",
      system: SYSTEM,
      user: JSON.stringify({
        business: businessText,
        theirAnswers: answers,
        planAlreadyChosen: { mail: baseMail, site: baseSite },
      }),
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "plan_proposal",
      maxOutputTokens: 900,
    });
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }

  /* Start from the deterministic answer. Every rejection below simply leaves it standing. */
  let mail = baseMail;
  let site = baseSite;
  const accepted: { entitlement: string; evidence: string }[] = [];
  const rejected: string[] = [];

  const tapped = new Set(
    (Array.isArray(input?.answeredByTap) ? input.answeredByTap : []).map((x) => String(x)),
  );

  for (const c of out?.cites ?? []) {
    const floor = ENTITLEMENT_FLOORS[c?.entitlement];
    if (!floor) {
      rejected.push(`unknown entitlement ${String(c?.entitlement).slice(0, 24)}`);
      continue;
    }
    /* They already answered the question this entitlement belongs to. Their tap stands. */
    const owner = ENTITLEMENT_QUESTION[c.entitlement];
    if (owner && tapped.has(owner)) {
      rejected.push(`${c.entitlement}: they answered "${owner}" themselves`);
      continue;
    }
    const evidence = String(c?.evidence ?? "").slice(0, 160);
    if (!evidenceIsReal(evidence, saidByThem)) {
      rejected.push(`${c.entitlement}: evidence not found in what they said`);
      continue;
    }
    /* The floor comes from OUR table. The model named the entitlement; it does not get to say
       what that entitlement requires. */
    if (floor.mail && MAIL_RANK[floor.mail] > MAIL_RANK[mail]) mail = floor.mail;
    if (floor.site && SITE_RANK[floor.site] > SITE_RANK[site]) site = floor.site;
    accepted.push({ entitlement: c.entitlement, evidence });
  }

  /* The model's own tier fields are advisory only — the tiers above are derived entirely from
     accepted citations. A raise with no surviving citation is refused, which is the whole
     guardrail: it cannot inflate a plan by asserting a tier. */
  if (out && (out.mailTier !== mail || out.siteTier !== site)) {
    rejected.push(
      `proposed ${out.mailTier}/${out.siteTier}, citations support ${mail}/${site}`,
    );
  }

  const raised = mail !== baseMail || site !== baseSite;

  console.error(
    "[plan]",
    JSON.stringify({
      sid,
      ms: Date.now() - startedAt,
      model: process.env.LLM_MODEL ?? "default",
      base: `${baseMail}/${baseSite}`,
      final: `${mail}/${site}`,
      raised,
      accepted: accepted.map((a) => a.entitlement).join(","),
      ...(rejected.length ? { rejected: rejected.join(" | ").slice(0, 300) } : {}),
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
    }),
  );

  return {
    status: 200,
    body: { mailTier: mail, siteTier: site, raised, cites: accepted, rejected },
  };
}
