import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentPage from '../pages/DocumentPage';

const mockNavigate = vi.fn();
const mockOnDelete = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'doc-1' }),
  useNavigate: () => mockNavigate,
  useOutletContext: () => ({ onDelete: mockOnDelete }),
}));

vi.mock('../documents/api', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

import { getDocument, updateDocument } from '../documents/api';

const mockGetDocument = vi.mocked(getDocument);
const mockUpdateDocument = vi.mocked(updateDocument);

const FAKE_DOC = {
  id: 'doc-1',
  title: 'Test Title',
  content: 'Test content',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocument.mockResolvedValue({ document: FAKE_DOC });
  mockUpdateDocument.mockResolvedValue({ document: FAKE_DOC });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DocumentPage', () => {
  it('shows loading state initially', () => {
    mockGetDocument.mockImplementation(() => new Promise(() => {}));
    render(<DocumentPage />);
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('renders title and content after load', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    expect(screen.getByDisplayValue('Test content')).toBeDefined();
  });

  it('shows not found when getDocument rejects', async () => {
    mockGetDocument.mockRejectedValue(new Error('404'));
    render(<DocumentPage />);
    await waitFor(() => screen.getByText('Document not found.'));
  });

  it('auto-saves after debounce when title changes', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'New Title' },
    });

    expect(mockUpdateDocument).not.toHaveBeenCalled();

    await waitFor(
      () =>
        expect(mockUpdateDocument).toHaveBeenCalledWith('doc-1', {
          title: 'New Title',
          content: 'Test content',
        }),
      { timeout: 2000 },
    );
  });

  it('shows Saved after successful auto-save', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Updated' },
    });

    await waitFor(() => screen.getByText('Saved'), { timeout: 2000 });
  });

  it('calls onDelete when Delete button clicked', async () => {
    mockOnDelete.mockResolvedValue(undefined);
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('doc-1'));
  });
});
