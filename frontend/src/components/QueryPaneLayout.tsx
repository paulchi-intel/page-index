import { useState, type ReactNode } from 'react';
import type { QueryPaneId, QueryPaneLayoutState } from '../hooks/useQueryPaneLayout';
import { PaneResizeHandle } from './PaneResizeHandle';


interface Props {
  state: QueryPaneLayoutState;
  widthLimits: {
    documents: { min: number; max: number };
    preview: { min: number; max: number };
  };
  onPaneWidthChange: (pane: 'documents' | 'preview', width: number) => void;
  mobileDocumentsOpen: boolean;
  mobilePreviewOpen: boolean;
  documents: ReactNode;
  preview: ReactNode;
  workspace: ReactNode;
}

const ORDER: QueryPaneId[] = ['documents', 'preview', 'workspace'];

export function QueryPaneLayout({ state, widthLimits, onPaneWidthChange, mobileDocumentsOpen, mobilePreviewOpen, documents, preview, workspace }: Props) {
  const [resizing, setResizing] = useState(false);
  const visiblePanes = ORDER.filter((pane) => state.visible[pane]);
  const lastVisible = visiblePanes.at(-1);
  const paneContent: Record<QueryPaneId, ReactNode> = { documents, preview, workspace };

  return <div
    className={`query-pane-layout ${resizing ? 'is-resizing' : ''}`}
    style={{
      '--documents-pane-width': `${state.widths.documents}px`,
      '--preview-pane-width': `${state.widths.preview}px`,
    } as React.CSSProperties}
  >
    {ORDER.flatMap((pane) => {
      const visibleIndex = visiblePanes.indexOf(pane);
      const isVisible = visibleIndex >= 0;
      const isLastVisible = pane === lastVisible;
      const slot = <section
        key={`${pane}-slot`}
        className={`query-pane-slot ${pane}-slot ${isVisible ? '' : 'desktop-pane-hidden'} ${isLastVisible ? 'is-last-visible' : ''} ${pane === 'documents' && !mobileDocumentsOpen ? 'mobile-pane-hidden' : ''} ${pane === 'documents' && mobileDocumentsOpen ? 'drawer-open' : ''} ${pane === 'preview' && !mobilePreviewOpen ? 'mobile-pane-hidden' : ''}`}
        aria-label={pane === 'documents' ? '文件庫區域' : pane === 'preview' ? '文件預覽區域' : '查詢工作區域'}
      >{paneContent[pane]}</section>;

      if (!isVisible || isLastVisible || pane === 'workspace') return [slot];
      const limits = widthLimits[pane];
      return [slot, <PaneResizeHandle
        key={`${pane}-resize`}
        label={pane === 'documents' ? '調整文件庫寬度' : '調整文件預覽寬度'}
        value={state.widths[pane]}
        min={limits.min}
        max={limits.max}
        onChange={(width) => onPaneWidthChange(pane, width)}
        onResizeStart={() => setResizing(true)}
        onResizeEnd={() => setResizing(false)}
      />];
    })}
  </div>;
}
