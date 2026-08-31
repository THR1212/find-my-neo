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
 * ── Why this opens a tab instead of an in-page overlay ────────────────────────────────────
 * An embedded overlay would be the better demo, and it does not work: with Vercel Deployment
 * Protection ON, the protection layer sends frame-blocking headers and the iframe dies with
 * "vercel.com refused to connect".
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
  var APP = "https://find-my-neo-hari-7720.vercel.app/";
  /* Share token baked in so the demo needs no login. This is a revocable Vercel share link,
     not a credential — regenerate it from the deployment's Share dialog if it leaks. */
  var TOKEN = "SzPTraioqbHBhOx4ahUsJVj8HpskjOrd";
  var URL_WITH_TOKEN = APP + "?_vercel_share=" + TOKEN;
  /* Only set true if Vercel Deployment Protection is OFF — otherwise the frame is blocked and
     you get a blank overlay with no way to detect it. See the header comment. */
  var USE_OVERLAY = false;
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
    frame.setAttribute("allow", "clipboard-write");

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
