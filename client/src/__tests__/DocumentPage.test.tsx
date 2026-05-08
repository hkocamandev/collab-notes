import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentPage from '../pages/DocumentPage';

const mockNavigate = vi.fn();
const mockOnDelete = vi.fn();
const mockOnUpdate = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'doc-1' }),
  useNavigate: () => mockNavigate,
  useOutletContext: () => ({ onDelete: mockOnDelete, onUpdate: mockOnUpdate }),
}));

vi.mock('../documents/api', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

// Editor is a contenteditable — mock it as a plain div for tests
vi.mock('../components/Editor', () => ({
  default: () => <div data-testid="editor" />,
}));

// FormatToolbar needs a real editor instance — render nothing in tests
vi.mock('../components/FormatToolbar', () => ({
  default: () => null,
}));

// Replace Tiptap with a minimal stub (no DOM/ProseMirror setup needed)
vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => null,
}));

vi.mock('../extensions/SlashCommand', () => ({ default: {} }));

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

  it('renders title after load', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
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
      { timeout: 3000 },
    );
    expect(mockOnUpdate).toHaveBeenCalledWith('doc-1', 'New Title');
  });

  it('shows saved dot after successful auto-save', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Updated' },
    });

    await waitFor(() => screen.getByLabelText('Saved'), { timeout: 3000 });
  });

  it('calls onDelete when Delete button clicked', async () => {
    mockOnDelete.mockResolvedValue(undefined);
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('doc-1'));
  });

  it('renders the paper frame and toolbar separately', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    expect(document.querySelector('.doc-paper')).toBeTruthy();
    expect(document.querySelector('.doc-toolbar')).toBeTruthy();
    expect(document.querySelector('.doc-toolbar-actions')).toBeTruthy();
  });
});
