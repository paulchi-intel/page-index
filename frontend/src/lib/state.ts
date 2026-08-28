import type { ConversationMessage, IndexTask } from '../types';

export type ConversationAction =
  | { type: 'reset' }
  | { type: 'start-query'; question: string }
  | { type: 'append-token'; text: string };

export function conversationReducer(state: ConversationMessage[], action: ConversationAction): ConversationMessage[] {
  if (action.type === 'reset') return [];
  if (action.type === 'start-query') return [...state, { role: 'user', content: action.question }, { role: 'assistant', content: '' }];
  const next = [...state];
  const last = next.at(-1);
  if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + action.text };
  return next;
}

export type TaskAction =
  | { type: 'add'; task: IndexTask }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; patch: Partial<IndexTask> | ((task: IndexTask) => Partial<IndexTask>) };

export function taskReducer(state: IndexTask[], action: TaskAction): IndexTask[] {
  if (action.type === 'add') return [...state, action.task];
  if (action.type === 'remove') return state.filter((task) => task.id !== action.id);
  return state.map((task) => task.id === action.id
    ? { ...task, ...(typeof action.patch === 'function' ? action.patch(task) : action.patch) }
    : task);
}
