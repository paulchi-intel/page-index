import type { AppConfig, FilesResponse, IndexEvent, ModelOption, ModelVerificationResult, ModelVerificationStreamEvent, QueryEvent, StructureNode } from '../types';
import { readSse } from './sse';

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text) as { detail?: string };
      throw new Error(payload.detail || text || `HTTP ${response.status}`);
    } catch (reason) {
      if (reason instanceof SyntaxError) throw new Error(text || `HTTP ${response.status}`);
      throw reason;
    }
  }
  return response.json() as Promise<T>;
}

export const api = {
  files: () => json<FilesResponse>('/api/files'),
  structure: (path: string) => json<Record<string, unknown> & { structure?: StructureNode[] }>(`/api/structure?json_path=${encodeURIComponent(path)}`),
  config: () => json<AppConfig>('/api/config'),
  saveConfig: (config: AppConfig) => json<{ ok: boolean }>('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
  }),
  models: async () => (await json<{ models: ModelOption[] }>('/api/models')).models,
  verifyModels: (apiKey: string, models: string[]) => json<ModelVerificationResult>('/api/models/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, models }),
  }),
  verifyModelsStream: async (apiKey: string, models: string[], onEvent: (event: ModelVerificationStreamEvent) => void) => {
    const response = await fetch('/api/models/verify/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, models }),
    });
    await readSse<ModelVerificationStreamEvent>(response, onEvent);
  },
  previewText: async (path: string) => {
    const response = await fetch(`/api/preview?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error(await response.text());
    return response.text();
  },
  upload: async (file: File) => {
    const body = new FormData(); body.append('file', file);
    return json<{ path: string; name: string; size: number }>('/api/upload', { method: 'POST', body });
  },
  query: async (body: object, signal: AbortSignal, onEvent: (event: QueryEvent) => void) => {
    const response = await fetch('/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    await readSse<QueryEvent>(response, onEvent);
  },
  index: async (filePath: string, onEvent: (event: IndexEvent) => void) => {
    const response = await fetch('/api/index', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_path: filePath }),
    });
    await readSse<IndexEvent>(response, onEvent);
  },
};
