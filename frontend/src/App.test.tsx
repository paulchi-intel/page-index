import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('loads the document library and presents the query workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      pairs: [], model: 'anthropic/test-model', index_model: 'anthropic/index-model', api_key_set: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<App />);
    expect(screen.getByText('PageIndex')).toBeInTheDocument();
    expect(await screen.findByText('尚無已建立索引的文件')).toBeInTheDocument();
    expect(screen.getByText(/找到真正相關的答案/)).toBeInTheDocument();
  });

  it('shows the model used by the active main tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      pairs: [], model: 'anthropic/query-model', index_model: 'openai/index-model', api_key_set: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<App />);

    expect(await screen.findByText('query-model')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '建立索引' }));
    expect(screen.getByText('index-model')).toBeInTheDocument();
    expect(screen.queryByText('query-model')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '查詢' }));
    expect(screen.getByText('query-model')).toBeInTheDocument();
  });

  it('preserves indexing tasks when switching tabs', async () => {
    let finishIndex!: (response: Response) => void;
    const indexResponse = new Promise<Response>((resolve) => { finishIndex = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/upload') return new Response(JSON.stringify({ path: 'C:/uploads/sample.pdf' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (String(input) === '/api/index') return indexResponse;
      return new Response(JSON.stringify({
        pairs: [], model: 'anthropic/query-model', index_model: 'openai/index-model', api_key_set: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const { container } = render(<App />);
    await screen.findByText('尚無已建立索引的文件');

    await userEvent.click(screen.getByRole('button', { name: '建立索引' }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await userEvent.upload(input!, new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }));
    const taskName = await screen.findByText('sample.pdf', { selector: '.task-row strong' });
    await userEvent.click(screen.getByRole('button', { name: '開始建立索引' }));
    expect(screen.getByText('執行中', { selector: '.task-row small' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '查詢' }));
    finishIndex(new Response([
      'data: {"type":"stage","stage":"summarize","label":"建立摘要"}',
      'data: {"type":"progress","done":3,"active":1,"peak":2}',
      'data: {"type":"done","output_name":"sample_structure.json"}',
      '',
    ].join('\n\n'), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    await waitFor(() => expect(screen.getByText('索引完成', { selector: '.task-row small' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '建立索引' }));
    expect(screen.getByText('sample.pdf', { selector: '.task-row strong' })).toBe(taskName);
    expect(screen.getByText('索引完成', { selector: '.task-row small' })).toBeInTheDocument();
    expect(screen.getByText('已產生 sample_structure.json')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles query panes while keeping at least one pane visible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      pairs: [], model: 'anthropic/query-model', index_model: 'openai/index-model', api_key_set: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<App />);
    await screen.findByText('尚無已建立索引的文件');

    await userEvent.click(screen.getByRole('button', { name: '隱藏文件庫' }));
    expect(screen.getByRole('button', { name: '顯示文件庫' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: '隱藏文件預覽' }));

    const workspaceToggle = screen.getByRole('button', { name: '隱藏查詢工作區' });
    expect(workspaceToggle).toBeDisabled();
    expect(screen.getByLabelText('查詢工作區域')).not.toHaveClass('desktop-pane-hidden');
  });
});
