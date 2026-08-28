import { useRef, type MouseEvent, type ReactNode } from 'react';

/** Adapted from React Bits SpotlightCard. */
export function SpotlightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (event: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !ref.current) return;
    ref.current.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    ref.current.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };
  return <div ref={ref} onMouseMove={move} className={`spotlight-card ${className}`}>{children}</div>;
}
