import { useNavigate, useParams } from 'react-router-dom';
import type { Document } from '../documents/api.js';

interface SidebarProps {
  documents: Document[];
  trashDocs: Document[];
  onCreateDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onRestoreDocument: (id: string) => void;
  onPermanentDeleteDocument: (id: string) => void;
}

export function Sidebar({
  documents,
  trashDocs,
  onCreateDocument,
  onDeleteDocument,
  onRestoreDocument,
  onPermanentDeleteDocument,
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
        <button className="btn-new-doc" onClick={onCreateDocument}>
          + New document
        </button>
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
    </aside>
  );
}
