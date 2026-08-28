import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { DocumentPair } from '../types';
import { PreviewPanel } from './PreviewPanel';


const document: DocumentPair = {
  json_name: 'guide_structure.json',
  json_path: 'documents/guide_structure.json',
  src_name: 'guide.pdf',
  src_path: 'documents/guide.pdf',
  has_src: true,
};


describe('PreviewPanel structure controls', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('expands and collapses every structure item while preserving individual toggles', async () => {
    vi.spyOn(api, 'structure').mockResolvedValue({
      structure: [
        { node_id: 'root', title: '第一章', nodes: [
          { node_id: 'child', title: '第一節', nodes: [{ node_id: 'leaf', title: '細項' }] },
        ] },
      ],
    });

    const { container } = render(<PreviewPanel document={document} open onClose={() => undefined} />);
    await userEvent.click(screen.getByRole('tab', { name: '結構' }));
    await screen.findByText('細項');

    const details = () => Array.from(container.querySelectorAll('details')) as HTMLDetailsElement[];
    expect(details().map((item) => item.open)).toEqual([true, false, false]);
    const controls = screen.getByLabelText('結構展開控制');
    expect(within(controls).getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '全部展開' })).toHaveTextContent('');

    await userEvent.click(screen.getByRole('button', { name: '全部展開' }));
    await waitFor(() => expect(details().every((item) => item.open)).toBe(true));
    expect(screen.getByRole('button', { name: '全部收合' })).toHaveTextContent('');

    await userEvent.click(screen.getByRole('button', { name: '全部收合' }));
    await waitFor(() => expect(details().every((item) => !item.open)).toBe(true));

    await userEvent.click(screen.getByText('第一章'));
    await waitFor(() => expect(details()[0].open).toBe(true));
    expect(details().slice(1).every((item) => !item.open)).toBe(true);
  });
});
