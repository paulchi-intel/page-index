import { describe, expect, it } from 'vitest';
import { readSse } from './sse';

describe('readSse', () => {
  it('preserves an event split across transport chunks', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"tok'));
        controller.enqueue(encoder.encode('en","text":"答案"}\n'));
        controller.enqueue(encoder.encode('\ndata: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    const events: Array<{ type: string; text?: string }> = [];
    await readSse(new Response(stream), (event) => events.push(event as { type: string; text?: string }));
    expect(events).toEqual([{ type: 'token', text: '答案' }, { type: 'done' }]);
  });
});
