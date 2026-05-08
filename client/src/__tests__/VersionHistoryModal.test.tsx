import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VersionHistoryModal from '../components/VersionHistoryModal';

vi.mock('../documents/api', () => ({
  listVersions: vi.fn(),
}));

import { listVersions } from '../documents/api';

const mockListVersions = vi.mocked(listVersions);
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListVersions.mockResolvedValue({ versions: [] });
});

describe('VersionHistoryModal', () => {
  it('renders title and a loading message initially', () => {
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Doc/)).toBeDefined();
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('shows empty state when no versions exist', async () => {
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText(/No versions yet/));
  });

  it('renders version rows with editor name and disabled Restore button', async () => {
    mockListVersions.mockResolvedValue({
      versions: [
        {
          id: 'v1',
          title: 'Snapshot title',
          editedAt: '2026-05-09T10:00:00Z',
          createdAt: '2026-05-09T10:01:00Z',
          editedBy: { id: 'u1', email: 'alice@x.com', name: 'Alice' },
        },
      ],
    });
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.getByText('alice@x.com')).toBeDefined();

    const restore = screen.getByText('Restore').closest('button');
    expect(restore?.disabled).toBe(true);
  });

  it('shows version count in the header when versions exist', async () => {
    mockListVersions.mockResolvedValue({
      versions: [
        { id: 'v1', title: 't', editedAt: '', createdAt: '',
          editedBy: { id: 'u1', email: 'a@x.com', name: null } },
        { id: 'v2', title: 't', editedAt: '', createdAt: '',
          editedBy: { id: 'u1', email: 'a@x.com', name: null } },
      ],
    });
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText(/Snapshots \(2\)/));
  });

  it('refresh button re-fetches versions', async () => {
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    await waitFor(() => screen.getByText(/No versions yet/));
    expect(mockListVersions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Refresh version list'));
    await waitFor(() => expect(mockListVersions).toHaveBeenCalledTimes(2));
  });

  it('calls onClose when backdrop clicked', () => {
    render(<VersionHistoryModal documentId="doc-1" documentTitle="Doc" onClose={onClose} />);
    const backdrop = document.querySelector('.modal-backdrop');
    if (!backdrop) throw new Error('No backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
