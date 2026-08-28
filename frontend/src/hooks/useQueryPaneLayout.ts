import { useCallback, useEffect, useState } from 'react';


export type QueryPaneId = 'documents' | 'preview' | 'workspace';

export interface QueryPaneLayoutState {
  visible: Record<QueryPaneId, boolean>;
  widths: {
    documents: number;
    preview: number;
  };
}

const STORAGE_KEY = 'pageindex.query-layout.v1';
const DEFAULT_STATE: QueryPaneLayoutState = {
  visible: { documents: true, preview: true, workspace: true },
  widths: { documents: 270, preview: 380 },
};
const WIDTH_LIMITS = {
  documents: { min: 220, max: 480 },
  preview: { min: 300, max: 800 },
} as const;

function clampWidth(pane: 'documents' | 'preview', value: number) {
  const { min, max } = WIDTH_LIMITS[pane];
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readStoredState(): QueryPaneLayoutState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<QueryPaneLayoutState>;
    const visible = {
      documents: stored.visible?.documents !== false,
      preview: stored.visible?.preview !== false,
      workspace: stored.visible?.workspace !== false,
    };
    if (!Object.values(visible).some(Boolean)) visible.workspace = true;
    return {
      visible,
      widths: {
        documents: clampWidth('documents', stored.widths?.documents ?? DEFAULT_STATE.widths.documents),
        preview: clampWidth('preview', stored.widths?.preview ?? DEFAULT_STATE.widths.preview),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function useQueryPaneLayout() {
  const [state, setState] = useState<QueryPaneLayoutState>(readStoredState);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // The layout remains usable when storage is unavailable or full.
      }
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [state]);

  const togglePane = useCallback((pane: QueryPaneId) => {
    setState((current) => {
      const visibleCount = Object.values(current.visible).filter(Boolean).length;
      if (current.visible[pane] && visibleCount === 1) return current;
      return { ...current, visible: { ...current.visible, [pane]: !current.visible[pane] } };
    });
  }, []);

  const setPaneWidth = useCallback((pane: 'documents' | 'preview', width: number) => {
    setState((current) => ({
      ...current,
      widths: { ...current.widths, [pane]: clampWidth(pane, width) },
    }));
  }, []);

  return { state, togglePane, setPaneWidth, widthLimits: WIDTH_LIMITS };
}
