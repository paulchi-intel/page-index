import { Check } from 'lucide-react';

const stages = [
  ['parse', '讀取'], ['toc_detect', '偵測'], ['toc_build', '結構'], ['toc_verify', '校驗'],
  ['node_expand', '展開'], ['summarise', '摘要'], ['finalise', '完成'],
] as const;

/** Presentational adaptation of React Bits Stepper; backend events remain the source of truth. */
export function StageStepper({ current, complete = false }: { current?: string; complete?: boolean }) {
  const active = stages.findIndex(([key]) => key === current);
  return (
    <ol className="stage-stepper" aria-label="索引階段">
      {stages.map(([key, label], index) => {
        const done = complete || (active >= 0 && index < active);
        const isActive = !complete && index === active;
        return (
          <li key={key} className={done ? 'done' : isActive ? 'active' : ''} aria-current={isActive ? 'step' : undefined}>
            <span className="step-dot">{done ? <Check size={12} /> : index + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
