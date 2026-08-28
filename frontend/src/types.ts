export interface DocumentPair {
  json_name: string;
  json_path: string;
  src_name: string | null;
  src_path: string | null;
  has_src: boolean;
}

export interface FilesResponse {
  pairs: DocumentPair[];
  model: string;
  index_model: string;
  api_key_set: boolean;
}

export interface AppConfig {
  api_key: string;
  api_key_set?: boolean;
  model: string;
  index_model: string;
}

export interface ModelOption { id: string; label: string }

export interface ModelVerificationDetail {
  id: string;
  available: boolean;
  status: number;
  error: string | null;
}

export interface ModelVerificationResult {
  models: ModelOption[];
  details: ModelVerificationDetail[];
  available: number;
  unavailable: number;
}

export type ModelVerificationStreamEvent =
  | { type: 'candidates'; models: ModelOption[] }
  | { type: 'checking'; id: string }
  | { type: 'result'; detail: ModelVerificationDetail }
  | { type: 'done'; result: ModelVerificationResult }
  | { type: 'error'; message: string };

export type ModelVerificationStatus = 'pending' | 'checking' | 'available' | 'unavailable';

export interface ModelVerificationItem extends ModelOption {
  status: ModelVerificationStatus;
  httpStatus?: number;
  error?: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SectionMatch {
  title?: string;
  start_index?: number;
  end_index?: number;
}

export interface StructureNode {
  title?: string;
  node_id?: string;
  start_index?: number;
  end_index?: number;
  summary?: string;
  text?: string;
  nodes?: StructureNode[];
}

export type QueryEvent =
  | { type: 'status'; message: string }
  | { type: 'sections'; sections: SectionMatch[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type IndexEvent =
  | { type: 'started'; name: string }
  | { type: 'stage'; stage: string; icon: string; label: string }
  | { type: 'progress'; done: number; active: number; peak: number }
  | { type: 'log'; text: string }
  | { type: 'prompt'; idx: number; label: string; text: string }
  | { type: 'done'; output: string; output_name: string }
  | { type: 'error'; message: string };

export interface IndexTask {
  id: string;
  file: File;
  filePath?: string;
  status: 'uploading' | 'ready' | 'running' | 'done' | 'error';
  stage?: string;
  stageLabel?: string;
  done: number;
  active: number;
  peak: number;
  logs: string[];
  prompts: Array<{ idx: number; label: string; text: string }>;
  error?: string;
  outputName?: string;
}
