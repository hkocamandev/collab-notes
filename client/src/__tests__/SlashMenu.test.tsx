import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import SlashMenu, { type SlashMenuHandle, type SlashCommandItem } from '../components/SlashMenu';

const makeItem = (title: string): SlashCommandItem => ({
  title,
  description: `${title} description`,
  icon: 'X',
  command: vi.fn(),
});

describe('SlashMenu', () => {
  it('renders all items', () => {
    const items = [makeItem('Heading 1'), makeItem('Bullet List')];
    render(<SlashMenu items={items} command={vi.fn()} />);
    expect(screen.getByText('Heading 1')).toBeDefined();
    expect(screen.getByText('Bullet List')).toBeDefined();
  });

  it('shows "No results" when items list is empty', () => {
    render(<SlashMenu items={[]} command={vi.fn()} />);
    expect(screen.getByText('No results')).toBeDefined();
  });

  it('calls command when item is clicked', () => {
    const commandFn = vi.fn();
    const items = [makeItem('Heading 1')];
    render(<SlashMenu items={items} command={commandFn} />);
    fireEvent.mouseDown(screen.getByText('Heading 1').closest('button')!);
    expect(commandFn).toHaveBeenCalledWith(items[0]);
  });

  it('ArrowDown moves selection down and Enter executes item', async () => {
    const commandFn = vi.fn();
    const items = [makeItem('A'), makeItem('B'), makeItem('C')];
    const ref = createRef<SlashMenuHandle>();
    render(<SlashMenu ref={ref} items={items} command={commandFn} />);

    await act(async () => {
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) });
    });
    ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) });

    expect(commandFn).toHaveBeenCalledWith(items[1]);
  });

  it('ArrowUp wraps to last item from first', async () => {
    const commandFn = vi.fn();
    const items = [makeItem('A'), makeItem('B'), makeItem('C')];
    const ref = createRef<SlashMenuHandle>();
    render(<SlashMenu ref={ref} items={items} command={commandFn} />);

    await act(async () => {
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) });
    });
    ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) });

    expect(commandFn).toHaveBeenCalledWith(items[2]);
  });

  it('Escape returns false (not handled)', () => {
    const ref = createRef<SlashMenuHandle>();
    render(<SlashMenu ref={ref} items={[makeItem('A')]} command={vi.fn()} />);
    const result = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Escape' }) });
    expect(result).toBe(false);
  });

  it('renders descriptions for each item', () => {
    const items = [makeItem('Code Block')];
    render(<SlashMenu items={items} command={vi.fn()} />);
    expect(screen.getByText('Code Block description')).toBeDefined();
  });
});
