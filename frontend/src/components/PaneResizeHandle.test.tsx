import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaneResizeHandle } from './PaneResizeHandle';


describe('PaneResizeHandle', () => {
  afterEach(cleanup);

  it('exposes separator values and supports keyboard resizing', async () => {
    const onChange = vi.fn();
    render(<PaneResizeHandle label="調整文件庫寬度" value={270} min={220} max={480} onChange={onChange} onResizeStart={() => undefined} onResizeEnd={() => undefined}/>);
    const separator = screen.getByRole('separator', { name: '調整文件庫寬度' });

    expect(separator).toHaveAttribute('aria-valuemin', '220');
    expect(separator).toHaveAttribute('aria-valuemax', '480');
    expect(separator).toHaveAttribute('aria-valuenow', '270');

    await userEvent.type(separator, '{arrowright}');
    expect(onChange).toHaveBeenLastCalledWith(286);
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith(318);
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith(220);
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(480);
  });

  it('resizes the leading pane with pointer movement', async () => {
    const onChange = vi.fn();
    const onResizeStart = vi.fn();
    const onResizeEnd = vi.fn();
    const { getByTestId } = render(<div><div data-testid="pane"/><PaneResizeHandle label="調整文件預覽寬度" value={380} min={300} max={800} onChange={onChange} onResizeStart={onResizeStart} onResizeEnd={onResizeEnd}/></div>);
    const pane = getByTestId('pane');
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ width: 380 } as DOMRect);
    const separator = screen.getByRole('separator', { name: '調整文件預覽寬度' });
    Object.defineProperty(separator, 'setPointerCapture', { value: vi.fn() });

    const dispatchPointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 1 },
      });
      fireEvent(separator, event);
    };
    dispatchPointer('pointerdown', 380);
    dispatchPointer('pointermove', 450);
    dispatchPointer('pointerup', 450);

    expect(onResizeStart).toHaveBeenCalledOnce();
    expect(onResizeEnd).toHaveBeenCalledOnce();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(450));
  });
});
