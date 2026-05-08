import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AskAi from '../components/AskAi';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../ai/api', () => ({
  askAi: vi.fn(),
}));

import { askAi } from '../ai/api';
const mockAskAi = vi.mocked(askAi);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AskAi', () => {
  it('renders textarea + Ask button', () => {
    render(<AskAi />);
    expect(screen.getByLabelText('Ask AI query')).toBeDefined();
    expect(screen.getByRole('button', { name: /Ask/i })).toBeDefined();
  });

  it('Ask button is disabled until query is non-empty', () => {
    render(<AskAi />);
    const button = screen.getByRole('button', { name: /Ask/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Ask AI query'), { target: { value: 'react' } });
    expect(button.disabled).toBe(false);
  });

  it('renders results after a successful query', async () => {
    mockAskAi.mockResolvedValue({
      results: [
        { id: 'd1', title: 'React Hooks Guide', similarity: 0.9 },
        { id: 'd2', title: 'JavaScript Tips', similarity: 0.5 },
      ],
    });
    render(<AskAi />);

    fireEvent.change(screen.getByLabelText('Ask AI query'), {
      target: { value: 'react hooks' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));

    await waitFor(() => screen.getByText('React Hooks Guide'));
    expect(screen.getByText('JavaScript Tips')).toBeDefined();
    expect(mockAskAi).toHaveBeenCalledWith('react hooks', 5);
  });

  it('shows empty-state message when results are empty', async () => {
    mockAskAi.mockResolvedValue({ results: [] });
    render(<AskAi />);

    fireEvent.change(screen.getByLabelText('Ask AI query'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));

    await waitFor(() => screen.getByText(/No matching documents/));
  });

  it('navigates to the document when a result is clicked', async () => {
    mockAskAi.mockResolvedValue({
      results: [{ id: 'd1', title: 'Plan', similarity: 0.7 }],
    });
    render(<AskAi />);

    fireEvent.change(screen.getByLabelText('Ask AI query'), { target: { value: 'plan' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));

    await waitFor(() => screen.getByText('Plan'));
    fireEvent.click(screen.getByText('Plan'));
    expect(mockNavigate).toHaveBeenCalledWith('/documents/d1');
  });

  it('shows an error message when the request fails', async () => {
    mockAskAi.mockRejectedValue(new Error('boom'));
    render(<AskAi />);

    fireEvent.change(screen.getByLabelText('Ask AI query'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));

    await waitFor(() => screen.getByText('boom'));
  });

  it('button shows Searching… while loading', async () => {
    mockAskAi.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<AskAi />);
    fireEvent.change(screen.getByLabelText('Ask AI query'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask/i }));
    await waitFor(() => screen.getByText('Searching…'));
  });
});
