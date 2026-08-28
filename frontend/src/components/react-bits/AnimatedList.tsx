import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface Props<T> {
  items: T[];
  selectedIndex: number;
  getKey: (item: T) => string;
  renderItem: (item: T, selected: boolean) => ReactNode;
  onSelect: (item: T, index: number) => void;
  empty?: ReactNode;
  ariaLabel: string;
}

/** Adapted from React Bits AnimatedList; keyboard handling is scoped to the list. */
export function AnimatedList<T>({ items, selectedIndex, getKey, renderItem, onSelect, empty, ariaLabel }: Props<T>) {
  const [focusedIndex, setFocusedIndex] = useState(Math.max(0, selectedIndex));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => setFocusedIndex(Math.max(0, selectedIndex)), [selectedIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (focusedIndex + delta + items.length) % items.length;
      setFocusedIndex(next);
      refs.current[next]?.focus();
    }
  };

  if (!items.length) return <div className="list-empty">{empty}</div>;
  return (
    <div className="animated-list" role="listbox" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <motion.button
          type="button"
          role="option"
          aria-selected={selectedIndex === index}
          className={`animated-list-item ${selectedIndex === index ? 'is-selected' : ''}`}
          key={getKey(item)}
          ref={(node) => { refs.current[index] = node; }}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.15) }}
          tabIndex={focusedIndex === index ? 0 : -1}
          onFocus={() => setFocusedIndex(index)}
          onClick={() => onSelect(item, index)}
        >
          {renderItem(item, selectedIndex === index)}
        </motion.button>
      ))}
    </div>
  );
}
