import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SettingsDialog } from './SettingsDialog';

describe('SettingsDialog model selectors', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads available models when opened and lets each model be selected', async () => {
    vi.spyOn(api, 'config').mockResolvedValue({
      api_key: '<REDACTED>',
      api_key_set: true,
      model: 'anthropic/model-a',
      index_model: 'anthropic/model-b',
    });
    const models = [
      { id: 'anthropic/model-a', label: 'Model A' },
      { id: 'anthropic/model-b', label: 'Model B' },
      { id: 'openai/model-c', label: 'Model C' },
    ];
    const modelsSpy = vi.spyOn(api, 'models').mockResolvedValue(models);

    render(<SettingsDialog open onClose={() => undefined} onSaved={() => undefined} />);

    await waitFor(() => expect(modelsSpy).toHaveBeenCalledOnce());
    const queryModel = await screen.findByLabelText('查詢模型');
    const indexModel = screen.getByLabelText('索引模型');
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    expect(screen.getByPlaceholderText('已儲存，無需重新輸入')).toBeInTheDocument();
    expect(queryModel.tagName).toBe('SELECT');
    expect(indexModel.tagName).toBe('SELECT');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: '重新載入清單' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '驗證支援模型…' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '模型來源文件 ↗' })).toHaveAttribute(
      'href', 'https://gnai.intel.com/meta?section=models',
    );
    expect(screen.getByRole('link', { name: '模型來源文件 ↗' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '模型來源文件 ↗' })).toHaveAttribute('rel', 'noopener noreferrer');

    await userEvent.selectOptions(queryModel, 'openai/model-c');
    await userEvent.selectOptions(indexModel, 'anthropic/model-a');
    expect(queryModel).toHaveValue('openai/model-c');
    expect(indexModel).toHaveValue('anthropic/model-a');
  });

  it('verifies candidates and replaces the dropdowns with supported models', async () => {
    vi.spyOn(api, 'config').mockResolvedValue({ api_key: '', api_key_set: true, model: 'anthropic/model-a', index_model: 'anthropic/model-b' });
    vi.spyOn(api, 'models').mockResolvedValue([
      { id: 'anthropic/model-a', label: 'Model A' },
      { id: 'anthropic/model-b', label: 'Model B' },
      { id: 'openai/model-c', label: 'Model C' },
    ]);
    let continueVerification: () => void = () => {};
    const verificationGate = new Promise<void>((resolve) => { continueVerification = resolve; });
    const result = {
      models: [{ id: 'openai/model-c', label: 'Model C' }], available: 1, unavailable: 2,
      details: [
        { id: 'anthropic/model-a', available: false, status: 403, error: '此 API key 沒有模型權限' },
        { id: 'anthropic/model-b', available: false, status: 404, error: '模型不存在或 endpoint 不支援' },
        { id: 'openai/model-c', available: true, status: 200, error: null },
      ],
    };
    const verifySpy = vi.spyOn(api, 'verifyModelsStream').mockImplementation(async (_apiKey, _models, onEvent) => {
      onEvent({ type: 'candidates', models: [
        { id: 'anthropic/model-a', label: 'Model A' },
        { id: 'anthropic/model-b', label: 'Model B' },
        { id: 'openai/model-c', label: 'Model C' },
      ] });
      await verificationGate;
      for (const detail of result.details) {
        onEvent({ type: 'checking', id: detail.id });
        onEvent({ type: 'result', detail });
      }
      onEvent({ type: 'done', result });
    });

    render(<SettingsDialog open onClose={() => undefined} onSaved={() => undefined} />);
    const queryModel = await screen.findByLabelText('查詢模型');
    await waitFor(() => expect(within(queryModel).getByRole('option', { name: 'Model C' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '驗證支援模型…' }));

    expect(await screen.findByText('已驗證 0/3 個模型')).toBeInTheDocument();
    expect(screen.getAllByText('待驗證')).toHaveLength(3);
    await act(async () => continueVerification());

    expect(await screen.findByText('驗證完成：1 個可用、2 個不可用')).toBeInTheDocument();
    expect(verifySpy).toHaveBeenCalledWith('', [
      'anthropic/model-a', 'anthropic/model-b', 'openai/model-c',
    ], expect.any(Function));
    expect(screen.getByLabelText('查詢模型')).toHaveValue('openai/model-c');
    expect(screen.getByLabelText('索引模型')).toHaveValue('openai/model-c');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
