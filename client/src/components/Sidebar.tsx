import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Document } from '../documents/api.js';

interface SidebarProps {
  documents: Document[];
  sharedDocs: Document[];
  trashDocs: Document[];
  /** Basic users hit a 5-document cap; we disable the create button when they do. */
  atDocumentLimit?: boolean;
  onCreateDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onRestoreDocument: (id: string) => void;
  onPermanentDeleteDocument: (id: string) => void;
  /** Optional extra slot rendered below the trash section (e.g. Ask AI panel). */
  children?: ReactNode;
}

export function Sidebar({
  documents,
  sharedDocs,
  trashDocs,
  atDocumentLimit = false,
  onCreateDocument,
  onDeleteDocument,
  onRestoreDocument,
  onPermanentDeleteDocument,
  children,
}: SidebarProps) {
  const navigate = useNavigate();
  const { id: currentId } = useParams<{ id: string }>();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <span className="brand-mark" />
          <span>Collab Notes</span>
        </div>
      </div>

      <div className="sidebar-section">
        <button
          className="btn-new-doc"
          onClick={onCreateDocument}
          disabled={atDocumentLimit}
          title={
            atDocumentLimit
              ? 'Document limit reached. Upgrade to Premium for unlimited docs.'
              : undefined
          }
        >
          + New document
        </button>
        {atDocumentLimit && (
          <p className="sidebar-limit-hint">
            5/5 used — upgrade to add more
          </p>
        )}
      </div>

      <nav className="sidebar-nav">
        {documents.length === 0 ? (
          <p className="sidebar-empty">No documents yet</p>
        ) : (
          documents.map(doc => (
            <div
              key={doc.id}
              className={`sidebar-item${doc.id === currentId ? ' active' : ''}`}
              onClick={() => navigate(`/documents/${doc.id}`)}
            >
              <span className="sidebar-item-title">{doc.title || 'Untitled'}</span>
              <button
                className="sidebar-item-action"
                onClick={e => {
                  e.stopPropagation();
                  onDeleteDocument(doc.id);
                }}
                title="Move to trash"
                aria-label="Delete document"
              >
                ×
              </button>
            </div>
          ))
        )}
      </nav>

      {sharedDocs.length > 0 && (
        <div className="sidebar-shared">
          <p className="sidebar-section-label">Shared with me</p>
          {sharedDocs.map(doc => (
            <div
              key={doc.id}
              className={`sidebar-item sidebar-item--shared${doc.id === currentId ? ' active' : ''}`}
              onClick={() => navigate(`/documents/${doc.id}`)}
            >
              <span className="sidebar-item-title">{doc.title || 'Untitled'}</span>
              {doc.ownerEmail && (
                <span className="sidebar-item-meta" title={`Shared by ${doc.ownerEmail}`}>
                  by {doc.ownerName ?? doc.ownerEmail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {trashDocs.length > 0 && (
        <div className="sidebar-trash">
          <p className="sidebar-section-label">Trash</p>
          {trashDocs.map(doc => (
            <div key={doc.id} className="sidebar-item sidebar-item--trash">
              <span className="sidebar-item-title">{doc.title || 'Untitled'}</span>
              <button
                className="sidebar-item-action sidebar-item-action--restore"
                onClick={() => onRestoreDocument(doc.id)}
                title="Restore"
                aria-label="Restore document"
              >
                ↩
              </button>
              <button
                className="sidebar-item-action sidebar-item-action--permanent-delete"
                onClick={() => onPermanentDeleteDocument(doc.id)}
                title="Delete permanently"
                aria-label="Permanently delete document"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {children}
    </aside>
  );
}
