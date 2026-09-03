import { createContext, useContext, type ReactNode } from "react";
import { useReducedMotion, motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * `quick` is for screens you read once and leave (hook, describe, guess).
 * `measured` is for the question stack: the last pass made each prompt pop in 200ms,
 * which read as a form advancing, not as a thought landing. Headline, lede and options
 * arrive in sequence so the next question has a second to appear.
 */
type Pace = "quick" | "measured";

const PaceContext = createContext<Pace>("quick");

const STACK = {
  quick: {
    hidden: {},
    show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
  },
  measured: {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
  },
} as const;

const ITEM = {
  quick: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
  },
  measured: {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  },
} as const;

export function ScreenIn({
  children,
  pace = "quick",
}: {
  children: ReactNode;
  pace?: Pace;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <PaceContext.Provider value={pace}>
      <motion.div variants={STACK[pace]} initial="hidden" animate="show">
        {children}
      </motion.div>
    </PaceContext.Provider>
  );
}

export function LineIn({ children, className }: { children: ReactNode; className?: string }) {
  const pace = useContext(PaceContext);
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={ITEM[pace]}>
      {children}
    </motion.div>
  );
}
