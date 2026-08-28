import { useState } from 'react';

/** Adapted from React Bits Folder for the PageIndex drop zone. */
export function Folder({ active = false, onActivate }: { active?: boolean; onActivate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      className={`folder-art ${open || active ? 'is-open' : ''}`}
      type="button"
      aria-label="選擇要建立索引的文件"
      aria-expanded={open || active}
      onClick={() => { setOpen((value) => !value); onActivate?.(); }}
    >
      <span className="folder-back">
        <span className="folder-paper paper-one" />
        <span className="folder-paper paper-two" />
        <span className="folder-paper paper-three" />
        <span className="folder-front" />
      </span>
    </button>
  );
}
