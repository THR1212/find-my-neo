import { AnimatePresence, motion } from "framer-motion";
import type { Profile } from "../lib/engine";

/**
 * The strip under a question, assembling as the answers land.
 *
 * DELIBERATELY NOT ONE OF NEO'S PRODUCT FILMS. Those loops are on the reveal, where there is
 * nothing to read and everything to admire. On a question screen the person has a decision in
 * front of them, and a looping video beside the options pulls the eye off the thing we are
 * asking them to do — it competes with the question instead of supporting it. The motion that
 * belongs here is motion about THEM: three slots that fill in as they answer, so the narrowing
 * is visible on the page and not only in the meter.
 *
 * Everything shown is already resolved. Nothing is predicted, and nothing appears before the
 * answer that earns it — an empty slot reading "not yet" is honest; a guessed one is not.
 */

type Slot = { key: string; label: string; value: string | null };

function mailboxSlot(profile: Profile): string | null {
  const n = Number(profile.mailboxCount ?? 0);
  if (!n) return null;
  if (n === 1) return "1 address";
  if (n >= 6) return "6+ addresses";
  return `${n} addresses`;
}

function siteSlot(profile: Profile): string | null {
  const v = profile.surface;
  const val = Array.isArray(v) ? v[0] : v;
  if (val === "both") return "Site + email";
  if (val === "mail") return "Email first";
  return null;
}

function bringingSlot(profile: Profile): string | null {
  const v = profile.importIntent;
  const val = Array.isArray(v) ? v[0] : v;
  switch (val) {
    case "none":
      return "Starting fresh";
    case "emails":
      return "Bringing mail";
    case "both":
      return "Mail + contacts";
    case "contacts":
      return "Bringing contacts";
    default:
      return null;
  }
}

export default function SetupTray({ profile }: { profile: Profile }) {
  const stem = typeof profile.brandName === "string" ? profile.brandName : null;

  const slots: Slot[] = [
    { key: "domain", label: "Domain", value: stem ? `${stem}.com` : null },
    { key: "mail", label: "Mailboxes", value: mailboxSlot(profile) },
    { key: "surface", label: "Setup", value: siteSlot(profile) },
    { key: "import", label: "Moving in", value: bringingSlot(profile) },
  ];

  const filled = slots.filter((s) => s.value !== null).length;

  return (
    <div className="tray" aria-label="What we have so far">
      <div className="tray-row">
        {slots.map((slot) => (
          <div key={slot.key} className={`tray-slot${slot.value ? " tray-slot-on" : ""}`}>
            <span className="tray-label">{slot.label}</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={slot.value ?? "pending"}
                className="tray-value"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {slot.value ?? "—"}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
      </div>
      <motion.div
        className="tray-progress"
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: filled / slots.length }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
