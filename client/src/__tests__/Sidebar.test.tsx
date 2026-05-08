import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';
import type { Document } from '../documents/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'doc-1' }),
}));

const ownerDoc = (id: string, title: string): Document => ({
  id, title, content: '[]', createdAt: '', updatedAt: '', deletedAt: null,
  permission: 'owner', ownerEmail: null, ownerName: null, shareCount: 0,
});

const sharedDoc = (id: string, title: string, ownerEmail: string): Document => ({
  id, title, content: '[]', createdAt: '', updatedAt: '', deletedAt: null,
  permission: 'editor', ownerEmail, ownerName: null, shareCount: null,
});

const DOCS: Document[] = [ownerDoc('doc-1', 'First Doc'), ownerDoc('doc-2', 'Second Doc')];

const TRASH: Document[] = [
  { ...ownerDoc('doc-3', 'Deleted Doc'), deletedAt: '2024-01-01' },
];

const SHARED: Document[] = [sharedDoc('doc-shared', 'Team Plan', 'alice@example.com')];

const defaultProps = {
  documents: DOCS,
  sharedDocs: [] as Document[],
  trashDocs: [] as Document[],
  onCreateDocument: vi.fn(),
  onDeleteDocument: vi.fn(),
  onRestoreDocument: vi.fn(),
  onPermanentDeleteDocument: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Sidebar', () => {
  it('renders document titles', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('First Doc')).toBeDefined();
    expect(screen.getByText('Second Doc')).toBeDefined();
  });

  it('calls onCreateDocument when new document button clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New document'));
    expect(defaultProps.onCreateDocument).toHaveBeenCalledTimes(1);
  });

  it('navigates to document when sidebar item clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('Second Doc'));
    expect(mockNavigate).toHaveBeenCalledWith('/documents/doc-2');
  });

  it('calls onDeleteDocument when delete button clicked', () => {
    render(<Sidebar {...defaultProps} />);
    const deleteButtons = screen.getAllByLabelText('Delete document');
    fireEvent.click(deleteButtons[1]); // Second doc
    expect(defaultProps.onDeleteDocument).toHaveBeenCalledWith('doc-2');
  });

  it('shows empty state when no documents', () => {
    render(<Sidebar {...defaultProps} documents={[]} />);
    expect(screen.getByText('No documents yet')).toBeDefined();
  });

  it('shows trash section when trashDocs provided', () => {
    render(<Sidebar {...defaultProps} trashDocs={TRASH} />);
    expect(screen.getByText('Trash')).toBeDefined();
    expect(screen.getByText('Deleted Doc')).toBeDefined();
  });

  it('calls onRestoreDocument when restore button clicked', () => {
    render(<Sidebar {...defaultProps} trashDocs={TRASH} />);
    fireEvent.click(screen.getByLabelText('Restore document'));
    expect(defaultProps.onRestoreDocument).toHaveBeenCalledWith('doc-3');
  });

  it('calls onPermanentDeleteDocument when permanent delete button clicked', () => {
    render(<Sidebar {...defaultProps} trashDocs={TRASH} />);
    fireEvent.click(screen.getByLabelText('Permanently delete document'));
    expect(defaultProps.onPermanentDeleteDocument).toHaveBeenCalledWith('doc-3');
  });

  it('highlights the active document', () => {
    render(<Sidebar {...defaultProps} />);
    const firstItem = screen.getByText('First Doc').closest('.sidebar-item');
    expect(firstItem?.className).toContain('active');
  });

  it('shows "Shared with me" section when sharedDocs provided', () => {
    render(<Sidebar {...defaultProps} sharedDocs={SHARED} />);
    expect(screen.getByText('Shared with me')).toBeDefined();
    expect(screen.getByText('Team Plan')).toBeDefined();
    expect(screen.getByText('by alice@example.com')).toBeDefined();
  });

  it('shared items have no delete button', () => {
    render(<Sidebar {...defaultProps} documents={[]} sharedDocs={SHARED} />);
    // 'Delete document' aria-label is only on owned doc items
    expect(screen.queryAllByLabelText('Delete document')).toHaveLength(0);
  });

  it('shared item is clickable for navigation', () => {
    render(<Sidebar {...defaultProps} sharedDocs={SHARED} />);
    fireEvent.click(screen.getByText('Team Plan'));
    expect(mockNavigate).toHaveBeenCalledWith('/documents/doc-shared');
  });
});
