import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useQueryPaneLayout } from './useQueryPaneLayout';


describe('useQueryPaneLayout', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists visibility and always keeps one pane visible', async () => {
    const { result } = renderHook(() => useQueryPaneLayout());

    act(() => result.current.togglePane('documents'));
    act(() => result.current.togglePane('preview'));
    expect(result.current.state.visible).toEqual({ documents: false, preview: false, workspace: true });

    act(() => result.current.togglePane('workspace'));
    expect(result.current.state.visible.workspace).toBe(true);
    await waitFor(() => expect(window.localStorage.getItem('pageindex.query-layout.v1')).toContain('"documents":false'));
  });

  it('clamps stored pane widths to their supported ranges', () => {
    const { result } = renderHook(() => useQueryPaneLayout());

    act(() => result.current.setPaneWidth('documents', 100));
    act(() => result.current.setPaneWidth('preview', 1200));

    expect(result.current.state.widths).toEqual({ documents: 220, preview: 800 });
  });

  it('restores a previously saved desktop layout', () => {
    window.localStorage.setItem('pageindex.query-layout.v1', JSON.stringify({
      visible: { documents: false, preview: true, workspace: true },
      widths: { documents: 340, preview: 560 },
    }));

    const { result } = renderHook(() => useQueryPaneLayout());

    expect(result.current.state).toEqual({
      visible: { documents: false, preview: true, workspace: true },
      widths: { documents: 340, preview: 560 },
    });
  });
});
