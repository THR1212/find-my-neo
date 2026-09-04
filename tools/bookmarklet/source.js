/**
 * Find My Neo — demo bookmarklet.
 *
 * Injects our entry point onto Neo's REAL pricing page, so the demo shows the thing where it
 * would actually live rather than in a standalone tab. That placement *is* the deployment
 * story, and it is far more convincing than describing it.
 *
 * Run tools/bookmarklet/build.mjs to turn this into the `javascript:` URL you drag to the
 * bookmarks bar. Edit this file, never the minified one.
 *
 * ── Overlay vs tab, and the one thing that decides it ─────────────────────────────────────
 * The in-page overlay works ONLY while Vercel Deployment Protection is OFF. With it on, the
 * request is redirected to Vercel's login page, which sends `X-Frame-Options: DENY` and
 * `frame-ancestors 'none'` — the iframe dies with "vercel.com refused to connect".
 *
 * (Neo does not block this. Their headers are `frame-ancestors 'self'` / `SAMEORIGIN`, which
 * stop others embedding *them*; they place no restriction on what their page may embed.)
 *
 * An earlier version tried the iframe and fell back on failure. That fallback was broken —
 * it used the frame's `load` event as the success signal, but **a blocked frame still fires
 * `load`**, so the failure was never detected and the user got a dead white overlay. There is
 * no reliable cross-origin way to tell "my app rendered" from "the error page rendered", so
 * the honest fix is not to guess.
 *
 * If you turn Deployment Protection off (project → Settings → Deployment Protection), the page
 * becomes publicly reachable and the overlay becomes possible again — flip USE_OVERLAY below.
 * Leave it false while protection is on.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────────────────
 * Runs only on a page you deliberately clicked it on. It injects a button and an overlay and
 * touches nothing else — no network calls to Neo, no form interaction, no data read from the
 * page. It is a demo aid, not an integration.
 */

(function () {
  /* neo-akinator.vercel.app, NOT find-my-neo-hari-7720 — and this is a correctness choice,
     not a preference. As of 04 Sep the -hari-7720 alias has Vercel Deployment Protection ON:
     every path 302s to vercel.com/sso-api, which answers X-Frame-Options: DENY, and the
     overlay below dies exactly as the header of this file predicts. neo-akinator serves 200
     with no frame headers, so it embeds.

     The trademark note in docs/naming.md still stands and this host is the thing it warns
     about — but a URL nobody can load is worse than a URL with an awkward word in it. The
     real fix is a public alias without the trademark (find-my-neo.vercel.app was unclaimed
     on 04 Sep); point this at it the moment one exists. */
  var APP = "https://neo-akinator.vercel.app/";
  /* Share token baked in so the demo needs no login. This is a revocable Vercel share link,
     not a credential — regenerate it from the deployment's Share dialog if it leaks. */
  /* Substituted by build.mjs from VERCEL_SHARE_TOKEN. Never commit a real token here:
     this file is tracked, so hardcoding one puts it in the repo whatever .gitignore says. */
  var TOKEN = "__SHARE_TOKEN__";
  var URL_WITH_TOKEN = TOKEN ? APP + "?_vercel_share=" + TOKEN : APP;
  /* TRUE because Vercel Deployment Protection is currently OFF (verified 31 Aug: the page
     serves a direct 200 with no X-Frame-Options and no frame-ancestors).
     If protection is ever turned back on, SET THIS BACK TO FALSE — the frame will be blocked
     and there is no reliable way to detect that from script. See the header comment. */
  var USE_OVERLAY = true;
  var ID = "fmn-root";

  /* Clicking the bookmarklet twice should reset, not stack two overlays. */
  var existing = document.getElementById(ID);
  if (existing) existing.remove();

  var root = document.createElement("div");
  root.id = ID;
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent = [
    "#" + ID + " .fmn-cta{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);",
    "z-index:2147483646;display:flex;align-items:center;gap:10px;padding:13px 22px;",
    "border:0;border-radius:999px;background:#0066ff;color:#fff;cursor:pointer;",
    "font:500 15px/1 Poppins,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,102,255,.34);",
    "transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s}",
    "#" + ID + " .fmn-cta:hover{transform:translateX(-50%) translateY(-2px);",
    "box-shadow:0 12px 34px rgba(0,102,255,.42)}",
    "#" + ID + " .fmn-spark{font-size:15px}",
    "#" + ID + " .fmn-overlay{position:fixed;inset:0;z-index:2147483647;background:#fff;",
    "opacity:0;transition:opacity .35s cubic-bezier(.16,1,.3,1)}",
    "#" + ID + " .fmn-overlay.on{opacity:1}",
    "#" + ID + " .fmn-overlay iframe{width:100%;height:100%;border:0;display:block}",
    "#" + ID + " .fmn-close{position:fixed;top:18px;right:20px;z-index:2147483647;",
    "width:34px;height:34px;border-radius:50%;border:1px solid #e4e4e4;background:#fff;",
    "color:#555;font:400 18px/1 system-ui;cursor:pointer}",
  ].join("");
  root.appendChild(style);

  var cta = document.createElement("button");
  cta.className = "fmn-cta";
  /* Same copy as HOOK_COPY in src/lib/brand.ts. If that changes, change this. */
  cta.innerHTML =
    '<span class="fmn-spark">✦</span><span>Not sure which plan? Answer a few questions</span>';
  root.appendChild(cta);

  function openTab() {
    window.open(URL_WITH_TOKEN, "_blank", "noopener");
  }

  cta.addEventListener("click", function () {
    if (!USE_OVERLAY) {
      openTab();
      return;
    }

    var overlay = document.createElement("div");
    overlay.className = "fmn-overlay";

    var frame = document.createElement("iframe");
    frame.src = URL_WITH_TOKEN;
    /* `autoplay` matters: the wait screen is three muted <video> loops, and muted autoplay in a
       cross-origin iframe is allowed by Chrome today but is exactly the kind of thing a policy
       change breaks silently — a failed play() renders nothing and the pane reads as blank.
       Delegating it costs nothing and removes the question. */
    frame.setAttribute("allow", "clipboard-write; autoplay");

    var close = document.createElement("button");
    close.className = "fmn-close";
    close.textContent = "✕";
    close.addEventListener("click", function () {
      overlay.remove();
      close.remove();
    });

    overlay.appendChild(frame);
    root.appendChild(overlay);
    root.appendChild(close);
    requestAnimationFrame(function () {
      overlay.classList.add("on");
    });
  });
})();
