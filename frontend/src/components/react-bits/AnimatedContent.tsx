import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';

/** Motion-based adaptation of the React Bits AnimatedContent transition. */
export function AnimatedContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >{children}</motion.div>
  );
}
