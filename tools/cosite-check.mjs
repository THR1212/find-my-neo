#!/usr/bin/env node
/**
 * Is a `.co.site` name already taken? A LOCAL tool, run by a person, on purpose.
 *
 *   NEO_PARTNER_SESSION='1:...' node tools/cosite-check.mjs proofandbutter.co.site [more...]
 *
 * ## Why this is a CLI and not part of the app
 *
 * This is the narrow half of a decision made 2026-09-03. The lookup it uses is Titan's
 * **Partner Panel support API**, and reaching it needs a Titan Support session — an admin
 * credential. Two things follow, and they are the whole reason this file exists in `tools/`
 * rather than in `api/`:
 *
 * 1. **An admin session must not sit in a function anonymous traffic can trigger.** Even
 *    reading nothing but a status code, a public endpoint backed by that session is an
 *    enumeration oracle: anyone who finds it can ask which domains exist in Titan's system.
 *    The reveal therefore keeps its HTTP probe and simply renders no availability badge on a
 *    `.co.site` name. Honest, and it costs us a green tick rather than a customer.
 * 2. **The session cannot be minted in code anyway.** `POST /partner-panel/login` takes an
 *    email and password, so the only options were a human pasting a session that silently
 *    expires, or a serverless function logging in as a human Titan Support user (with no 2FA)
 *    on every cold start. Neither is shippable.
 *
 * The fix for both is a scoped service credential, or `check-domain-availability` returning
 * something other than a 500. Until then: this script, run deliberately, for demo prep and
 * spot checks. See `docs/bll-access-request.md`.
 *
 * ## The one rule
 *
 * **We read the status code and NEVER the body.** A 200 body carries the customer's email
 * address, name, customerId and order history. There is no `.json()` or `.text()` below and
 * there must never be — the status alone is a complete answer, so parsing could only ever
 * add a liability. Even here, in a local tool, printing another customer's email to a
 * terminal is not something this needs to do to answer a yes/no.
 *
 * ## Getting a session
 *
 * Log in to `admin.titan.email` in a browser, open DevTools → Network, click any
 * `partner-panel/*` request, and copy the `x-auth-token` request header. It expires; when it
 * does this prints `unknown` rather than guessing, and you fetch a new one.
 */

const PANEL = process.env.NEO_PARTNER_PANEL_URL
  ?? "https://api.flockmail.com/partner-panel/bundle/list";

/* The real panel sends a structured client string. Mirrored because some Titan endpoints
   require one, and a request that looks nothing like the panel's is likelier to be refused. */
const UA = "client=partner_panel;tp=titan;os=Linux;browser=Node;appVersion=294;locale=en";

/**
 * Neo's own namespace, and the only place this lookup's answer means what we want.
 *
 * A 404 means "not in Titan's system". Inside `.co.site` that is the same as free, because
 * Titan is the only issuer. Outside it, it means nothing at all — asked about `example.com`
 * this API would answer 404 for a domain that is very much registered. Hence the hard guard
 * below rather than a comment hoping to be read.
 */
const SUFFIX = ".co.site";

const TIMEOUT_MS = 10_000;

async function check(domain) {
  const res = await fetch(`${PANEL}?query=${encodeURIComponent(domain)}`, {
    headers: {
      "x-auth-token": process.env.NEO_PARTNER_SESSION,
      "x-user-agent": UA,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Status only. Do not add body parsing here. See the header.
  if (res.status === 200) return { verdict: "TAKEN", note: "an order holds this name" };
  if (res.status === 404) return { verdict: "free", note: "no bundle in Titan's system" };
  if (res.status === 401 || res.status === 403) {
    return { verdict: "unknown", note: `session rejected (${res.status}) — fetch a new one` };
  }
  return { verdict: "unknown", note: `unexpected status ${res.status}` };
}

async function main() {
  const domains = process.argv.slice(2);

  if (!process.env.NEO_PARTNER_SESSION) {
    console.error("NEO_PARTNER_SESSION is not set.\n");
    console.error("  Log in to admin.titan.email, DevTools -> Network, click any");
    console.error("  partner-panel/* request, copy its x-auth-token header, then:\n");
    console.error("    NEO_PARTNER_SESSION='1:...' node tools/cosite-check.mjs <domain>\n");
    console.error("Pass it inline like that rather than putting it in .env.local: it is an");
    console.error("admin session, it expires anyway, and nothing in the app should read it.");
    process.exit(2);
  }
  if (!domains.length) {
    console.error("usage: node tools/cosite-check.mjs <name.co.site> [more...]");
    console.error("       bare stems are accepted and get .co.site appended");
    process.exit(2);
  }

  let bad = false;
  for (const raw of domains) {
    /* A bare stem is the common case when checking a business name, so append the suffix
       rather than making the caller remember it. Anything else with a dot is refused. */
    const domain = raw.includes(".") ? raw.toLowerCase() : `${raw.toLowerCase()}${SUFFIX}`;

    if (!domain.endsWith(SUFFIX)) {
      console.log(`  ${domain.padEnd(34)} REFUSED   not a ${SUFFIX} name`);
      console.log(`  ${" ".repeat(34)}          a 404 here would mean "not at Titan", not "free"`);
      bad = true;
      continue;
    }

    try {
      const { verdict, note } = await check(domain);
      console.log(`  ${domain.padEnd(34)} ${verdict.padEnd(9)} ${note}`);
      if (verdict === "unknown") bad = true;
    } catch (err) {
      console.log(`  ${domain.padEnd(34)} unknown   ${err.name === "TimeoutError" ? "timed out" : String(err.message).slice(0, 60)}`);
      bad = true;
    }
  }

  /* Non-zero when anything was inconclusive, so this is usable in a script without someone
     having to parse the words above. "free" and "TAKEN" are both successful answers. */
  process.exit(bad ? 1 : 0);
}

await main();
