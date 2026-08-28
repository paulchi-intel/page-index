import { type ReactNode } from 'react';

/** A reduced-motion, CSS-only adaptation of React Bits BorderGlow. */
export function BorderGlow({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'green' | 'red' }) {
  return <div className={`border-glow tone-${tone}`}><div className="border-glow-inner">{children}</div></div>;
}
