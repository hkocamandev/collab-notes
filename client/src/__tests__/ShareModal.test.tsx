import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShareModal from '../components/ShareModal';
import { ApiError } from '../lib/apiClient';

vi.mock('../documents/api', () => ({
  listShares: vi.fn(),
  shareDocument: vi.fn(),
  revokeShare: vi.fn(),
}));

// signalRevoke uses the real Yjs cache; in unit tests we just stub it.
vi.mock('../lib/yjsCache', () => ({
  signalRevoke: vi.fn(),
}));

// docEvents.broadcastDocEvent is a no-op in tests but we want to assert the
// share-added payload contains sender info + doc title.
vi.mock('../lib/docEvents', () => ({
  broadcastDocEvent: vi.fn(),
}));

// ShareModal calls useAuth() to read the current user for the broadcast.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-sender', email: 'sender@x.com', name: 'Sender Name', plan: 'premium' },
  }),
}));

import { listShares, shareDocument, revokeShare } from '../documents/api';
import { broadcastDocEvent } from '../lib/docEvents';

const mockListShares = vi.mocked(listShares);
const mockShareDocument = vi.mocked(shareDocument);
const mockRevokeShare = vi.mocked(revokeShare);
const mockBroadcastDocEvent = vi.mocked(broadcastDocEvent);

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListShares.mockResolvedValue({ shares: [] });
});

describe('ShareModal', () => {
  it('renders title and form', async () => {
    render(<ShareModal documentId="doc-1" documentTitle="My Doc" onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/My Doc/)).toBeDefined();
    expect(screen.getByLabelText('Email to share with')).toBeDefined();
  });

  it('shows existing shares loaded from API', async () => {
    mockListShares.mockResolvedValue({
      shares: [
        {
          id: 's1', userId: 'u2', userEmail: 'alice@x.com', userName: 'Alice',
          permission: 'edit', createdAt: '',
        },
      ],
    });
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.getByText('alice@x.com')).toBeDefined();
  });

  it('submits a new share and re-fetches the list (showing new share)', async () => {
    // Initial list is empty; after sharing, server returns the new share.
    mockListShares.mockResolvedValueOnce({ shares: [] });
    mockShareDocument.mockResolvedValue({
      share: {
        id: 's2', userId: 'u3', userEmail: 'bob@x.com', userName: null,
        permission: 'edit', createdAt: '',
      },
    });
    mockListShares.mockResolvedValueOnce({
      shares: [
        { id: 's2', userId: 'u3', userEmail: 'bob@x.com', userName: null, permission: 'edit', createdAt: '' },
      ],
    });
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email to share with'), {
      target: { value: 'bob@x.com' },
    });
    // The submit button's accessible name is exactly "Share" (modal title differs).
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(mockShareDocument).toHaveBeenCalledWith('doc-1', 'bob@x.com'),
    );
    await waitFor(() => screen.getByText('bob@x.com'));
  });

  it('shows user-not-found error on 404', async () => {
    mockShareDocument.mockRejectedValue(new ApiError(404, null, 'No user'));
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email to share with'), {
      target: { value: 'ghost@x.com' },
    });
    fireEvent.click(screen.getByText('Share'));

    await waitFor(() => screen.getByText(/No user with that email/));
  });

  it('shows already-shared error on 409', async () => {
    mockShareDocument.mockRejectedValue(new ApiError(409, null, 'Already shared'));
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email to share with'), {
      target: { value: 'alice@x.com' },
    });
    fireEvent.click(screen.getByText('Share'));

    await waitFor(() => screen.getByText(/already shared/));
  });

  it('shows basic-plan limit error on 403 share-limit body', async () => {
    mockShareDocument.mockRejectedValue(
      new ApiError(403, { kind: 'share-limit', limit: 1, plan: 'basic' }, 'Limit'),
    );
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email to share with'), {
      target: { value: 'second@x.com' },
    });
    fireEvent.click(screen.getByText('Share'));

    await waitFor(() => screen.getByText(/Basic plan allows only 1 share/));
  });

  it('revokes a share and re-fetches the list (showing empty)', async () => {
    // First load: Alice exists. After revoke, list is empty.
    mockListShares.mockResolvedValueOnce({
      shares: [
        { id: 's1', userId: 'u2', userEmail: 'alice@x.com', userName: 'Alice', permission: 'edit', createdAt: '' },
      ],
    });
    mockRevokeShare.mockResolvedValue(undefined);
    mockListShares.mockResolvedValueOnce({ shares: [] });
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText('Alice'));

    fireEvent.click(screen.getByLabelText('Revoke access for alice@x.com'));
    await waitFor(() =>
      expect(mockRevokeShare).toHaveBeenCalledWith('doc-1', 'u2'),
    );
    await waitFor(() => expect(screen.queryByText('Alice')).toBeNull());
  });

  it('calls onClose when backdrop clicked', () => {
    render(<ShareModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    const backdrop = document.querySelector('.modal-backdrop');
    if (!backdrop) throw new Error('No backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('broadcasts share-added with sender info + doc title after a successful share', async () => {
    mockListShares.mockResolvedValueOnce({ shares: [] });
    mockShareDocument.mockResolvedValue({
      share: {
        id: 's-new', userId: 'u-recipient', userEmail: 'bob@x.com', userName: null,
        permission: 'edit', createdAt: '',
      },
    });
    mockListShares.mockResolvedValueOnce({ shares: [] });
    render(<ShareModal documentId="doc-1" documentTitle="Project Plan" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Email to share with'), {
      target: { value: 'bob@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(mockBroadcastDocEvent).toHaveBeenCalled());
    expect(mockBroadcastDocEvent).toHaveBeenCalledWith({
      type: 'share-added',
      forUserId: 'u-recipient',
      senderName: 'Sender Name',
      senderEmail: 'sender@x.com',
      docTitle: 'Project Plan',
    });
  });

  it('Editor pill jumps to end and closes modal when clicked', async () => {
    mockListShares.mockResolvedValue({
      shares: [
        { id: 's1', userId: 'u2', userEmail: 'alice@x.com', userName: 'Alice', permission: 'edit', createdAt: '' },
      ],
    });
    const onJumpToEnd = vi.fn();
    render(
      <ShareModal
        documentId="doc-1"
        documentTitle="Doc"
        onClose={onClose}
        onJumpToEnd={onJumpToEnd}
      />,
    );
    await waitFor(() => screen.getByText('Alice'));

    fireEvent.click(screen.getByLabelText('Jump to end of document'));
    expect(onJumpToEnd).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
