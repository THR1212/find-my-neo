import { motion } from "framer-motion";
import type { RevealContent, SurfaceChoice } from "../lib/session";
import plansData from "../data/plans.json";

interface Plan {
  id: string;
  name: string;
  priceInr: number | null;
  billing: string;
  includesSite: boolean;
  blurb: string;
}

const PLANS = plansData.plans as Plan[];

/**
 * Screen 5 — THE screen. Everything else in this flow exists to set it up.
 *
 * The effect is line-by-line materialisation: domain, then mailboxes, then the drafted
 * site, then the plan quietly underneath. Each block lands on its own beat so the viewer
 * reads it as the tool *working* rather than as a page that loaded.
 *
 * Two rules that hold here:
 *  - The plan and price are shown quietly, last, and are NOT chosen by the model. For
 *    milestone 1 the plan is hardcoded; for Ignite it comes from src/lib/rules.ts.
 *  - The CTA is a user-clicked link into Neo's flow, never a silent redirect. It is inert
 *    in this build.
 */

/** Beat between blocks. Slow enough to read, fast enough not to stall a live demo. */
const BEAT = 0.55;

const block = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const ease = [0.16, 1, 0.3, 1] as const;

export default function Reveal({
  reveal,
  loading,
  error,
  surface,
  onRestart,
}: {
  reveal: RevealContent | null;
  loading: boolean;
  error: string | null;
  surface: SurfaceChoice | null;
  onRestart: () => void;
}) {
  if (error) {
    return (
      <div>
        <p className="eyebrow">Something broke</p>
        <h1>We couldn't build that.</h1>
        <p className="lede">{error}</p>
        <button className="btn" onClick={onRestart}>
          Start again
        </button>
      </div>
    );
  }

  if (loading || !reveal) {
    return (
      <div>
        <p className="eyebrow">Almost there</p>
        <h1 style={{ color: "var(--text-faint)" }}>Building your setup…</h1>
        <div className="dots" aria-label="Loading">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  const showSite = surface !== "mail";

  /**
   * Deterministic plan selection. For milestone 1 this is the whole "rules table" — one
   * boolean. It lives here rather than in the prompt on purpose: the model is never allowed
   * to pick a plan or a price. src/lib/rules.ts takes this over for Ignite.
   */
  const plan =
    PLANS.find((p) => p.includesSite === showSite) ?? PLANS[PLANS.length - 1];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: BEAT, delayChildren: 0.15 }}
    >
      <motion.p variants={block} transition={{ duration: 0.6, ease }} className="eyebrow">
        Your setup
      </motion.p>

      {/* 1. The domain. The single most convincing thing on the screen. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }}>
        <div className="domain">
          <span className="domain-name">{reveal.domain.name}</span>
          {reveal.domain.available && <span className="badge">Available</span>}
        </div>
      </motion.div>

      {/* 2. Mailboxes. Each one is a small argument for why this is worth paying for. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }} className="reveal-block">
        <p className="reveal-label">Your mailboxes</p>
        {reveal.mailboxes.map((m, i) => (
          <motion.div
            key={m.address}
            className="mailbox"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: BEAT * 2 + 0.18 * i, duration: 0.5, ease }}
          >
            <span className="mailbox-address">{m.address}</span>
            <span className="mailbox-label">{m.label}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* 3. The drafted site. Skipped entirely if they said mail-only. */}
      {showSite && (
        <motion.div variants={block} transition={{ duration: 0.7, ease }} className="reveal-block">
          <p className="reveal-label">Your site, drafted</p>
          <div className="site-preview">
            <p className="site-headline">{reveal.site.headline}</p>
            <p className="site-subhead">{reveal.site.subhead}</p>
            <div className="site-nav">
              {reveal.site.sections.map((sec) => (
                <span key={sec}>{sec}</span>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* 4. Plan and price, quietly, last. Never chosen by the model — see header.
             Price is omitted entirely while plans.json has priceInr: null. A wrong price in
             front of the Neo PM team is worse than no price; fill plans.json to show it. */}
      <motion.div variants={block} transition={{ duration: 0.7, ease }} className="plan-line">
        <div>
          <div className="plan-name">
            {plan.name}
            {plan.priceInr !== null && ` · ₹${plan.priceInr} ${plan.billing}`}
          </div>
          <div className="plan-meta">
            {reveal.mailboxes.length} mailboxes{showSite ? " · site included" : ""} · cancel
            anytime
          </div>
        </div>
        <div className="row" style={{ marginTop: 0 }}>
          <button className="btn" autoFocus>
            Claim this setup
          </button>
          <button className="btn btn-ghost" onClick={onRestart}>
            Start over
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
