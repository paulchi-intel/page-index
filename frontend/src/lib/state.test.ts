import { describe, expect, it } from 'vitest';
import { conversationReducer, taskReducer } from './state';
import type { IndexTask } from '../types';

describe('conversationReducer', () => {
  it('streams tokens into the active assistant response', () => {
    let state = conversationReducer([], { type: 'start-query', question: '問題' });
    state = conversationReducer(state, { type: 'append-token', text: '答' });
    state = conversationReducer(state, { type: 'append-token', text: '案' });
    expect(state).toEqual([{ role: 'user', content: '問題' }, { role: 'assistant', content: '答案' }]);
  });
});

describe('taskReducer', () => {
  it('keeps backend index progress as task state', () => {
    const task = { id: '1', file: new File(['x'], 'x.pdf'), status: 'ready', done: 0, active: 0, peak: 0, logs: [], prompts: [] } satisfies IndexTask;
    let state = taskReducer([], { type: 'add', task });
    state = taskReducer(state, { type: 'patch', id: '1', patch: { status: 'running', stage: 'parse', done: 2, active: 1 } });
    state = taskReducer(state, { type: 'patch', id: '1', patch: { status: 'done', outputName: 'x_structure.json' } });
    expect(state[0]).toMatchObject({ status: 'done', stage: 'parse', done: 2, outputName: 'x_structure.json' });
  });
});
