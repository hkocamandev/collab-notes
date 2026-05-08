import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToastList, { type ToastItem } from '../components/Toast';

const onDismiss = vi.fn();

const exampleToasts: ToastItem[] = [
  { id: 't1', title: 'Alice shared a document with you', body: '"Project plan"' },
];

describe('ToastList', () => {
  it('renders nothing when the list is empty', () => {
    const { container } = render(<ToastList toasts={[]} onDismiss={onDismiss} />);
    expect(container.querySelector('.toast-list')).toBeNull();
  });

  it('renders a toast with title + body', () => {
    render(<ToastList toasts={exampleToasts} onDismiss={onDismiss} />);
    expect(screen.getByText('Alice shared a document with you')).toBeDefined();
    expect(screen.getByText('"Project plan"')).toBeDefined();
  });

  it('calls onDismiss when the close button is clicked', () => {
    onDismiss.mockClear();
    render(<ToastList toasts={exampleToasts} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('exposes an aria-live polite region', () => {
    render(<ToastList toasts={exampleToasts} onDismiss={onDismiss} />);
    const region = screen.getByRole('region', { name: /notifications/i });
    expect(region.getAttribute('aria-live')).toBe('polite');
  });
});
