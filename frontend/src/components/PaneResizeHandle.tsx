import { useRef, type KeyboardEvent, type PointerEvent } from 'react';


interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

export function PaneResizeHandle({ label, value, min, max, onChange, onResizeStart, onResizeEnd }: Props) {
  const frameRef = useRef<number | null>(null);
  const pendingValueRef = useRef(value);

  const commitValue = (nextValue: number) => {
    pendingValueRef.current = Math.min(max, Math.max(min, nextValue));
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      onChange(pendingValueRef.current);
    });
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const pane = handle.previousElementSibling as HTMLElement | null;
    const startX = event.clientX;
    const startWidth = pane?.getBoundingClientRect().width || value;
    if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
    onResizeStart();

    const move = (moveEvent: globalThis.PointerEvent) => commitValue(startWidth + moveEvent.clientX - startX);
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        onChange(pendingValueRef.current);
      }
      onResizeEnd();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    let nextValue: number | undefined;
    if (event.key === 'ArrowLeft') nextValue = value - step;
    if (event.key === 'ArrowRight') nextValue = value + step;
    if (event.key === 'Home') nextValue = min;
    if (event.key === 'End') nextValue = max;
    if (nextValue === undefined) return;
    event.preventDefault();
    onChange(Math.min(max, Math.max(min, nextValue)));
  };

  return <div
    className="pane-resize-handle"
    role="separator"
    tabIndex={0}
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    onPointerDown={startDrag}
    onKeyDown={resizeWithKeyboard}
  />;
}
