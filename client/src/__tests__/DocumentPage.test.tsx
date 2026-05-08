import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import DocumentPage from '../pages/DocumentPage';

const mockNavigate = vi.fn();
const mockOnDelete = vi.fn();
const mockOnUpdate = vi.fn();
const mockOnRevokedFromDoc = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'doc-1' }),
  useNavigate: () => mockNavigate,
  useOutletContext: () => ({
    onDelete: mockOnDelete,
    onUpdate: mockOnUpdate,
    onRevokedFromDoc: mockOnRevokedFromDoc,
  }),
}));

vi.mock('../documents/api', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Test User', email: 'test@test.com' } }),
}));

// Mock useCollabTitle as a thin useState wrapper so DocumentPage tests don't need
// real Yjs. seedIfEmpty mirrors the real hook: write only if current title is empty.
vi.mock('../lib/yjsCache', () => ({
  useCollabTitle: (_docId: string) => {
    const [title, setTitleLocal] = useState('');
    return [
      title,
      (newTitle: string) => setTitleLocal(newTitle),
      (dbTitle: string) => {
        if (dbTitle && !title) setTitleLocal(dbTitle);
      },
    ] as const;
  },
}));

// CollabEditor stub: sets loadedRef + signals editor ready (simulates Yjs sync)
vi.mock('../components/CollabEditor', () => ({
  default: ({
    onEditorReady,
    loadedRef,
  }: {
    onEditorReady: (e: null) => void;
    loadedRef: { current: boolean };
  }) => {
    loadedRef.current = true;
    onEditorReady(null);
    return <div data-testid="collab-editor" />;
  },
}));

vi.mock('../components/FormatToolbar', () => ({
  default: () => null,
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
  permission: 'owner' as const,
  ownerEmail: null,
  ownerName: null,
  shareCount: 0,
};

const FAKE_SHARED_DOC = {
  ...FAKE_DOC,
  permission: 'editor' as const,
  ownerEmail: 'owner@example.com',
  ownerName: 'Owner Name',
  shareCount: null,
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

  it('calls onDelete when Delete button clicked', async () => {
    mockOnDelete.mockResolvedValue(undefined);
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('doc-1'));
  });

  it('renders paper frame, toolbar, and collab editor', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));

    expect(document.querySelector('.doc-paper')).toBeTruthy();
    expect(document.querySelector('.doc-toolbar')).toBeTruthy();
    expect(document.querySelector('.doc-toolbar-actions')).toBeTruthy();
    expect(screen.getByTestId('collab-editor')).toBeDefined();
  });

  it('owner sees Share, Delete, and Export PDF buttons', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    expect(screen.getByText('Share')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
    expect(screen.getByText('Export PDF')).toBeDefined();
  });

  it('Export PDF button is disabled (placeholder for future feature)', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    const exportButton = screen.getByText('Export PDF').closest('button');
    expect(exportButton?.disabled).toBe(true);
  });

  it('Share button shows share count badge when document has shares', async () => {
    mockGetDocument.mockResolvedValue({ document: { ...FAKE_DOC, shareCount: 3 } });
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    // Badge text is the count number
    expect(screen.getByText('3')).toBeDefined();
  });

  it('Share button has no badge when shareCount is 0', async () => {
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    // No badge — '0' shouldn't appear next to Share
    const shareButton = screen.getByText('Share').closest('button');
    expect(shareButton?.querySelector('.share-count-badge')).toBeNull();
  });

  it('shared editor sees neither Share, Delete nor Export, only owner attribution', async () => {
    mockGetDocument.mockResolvedValue({ document: FAKE_SHARED_DOC });
    render(<DocumentPage />);
    await waitFor(() => screen.getByDisplayValue('Test Title'));
    expect(screen.queryByText('Share')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByText('Export PDF')).toBeNull();
    expect(screen.getByText(/Shared by/)).toBeDefined();
  });
});
