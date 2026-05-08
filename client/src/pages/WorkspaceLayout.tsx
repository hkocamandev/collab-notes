import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { Sidebar } from '../components/Sidebar.js';
import {
  type Document,
  createDocument,
  deleteDocument,
  listDocuments,
  listTrash,
  permanentlyDeleteDocument,
  restoreDocument,
} from '../documents/api.js';
import { broadcastDocEvent, useDocEvents } from '../lib/docEvents.js';

export interface WorkspaceOutletContext {
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, title: string) => void;
  // Called when the current user has been revoked from a shared document.
  // Removes the doc from the sidebar's "Shared with me" list.
  onRevokedFromDoc: (id: string) => void;
}

export default function WorkspaceLayout() {
  const { user, logout } = useAuth();
  const currentUserId = user?.id ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  // Owner-only docs (full control)
  const [documents, setDocuments] = useState<Document[]>([]);
  // Shared-with-me docs (editor permission only)
  const [sharedDocs, setSharedDocs] = useState<Document[]>([]);
  const [trashDocs, setTrashDocs] = useState<Document[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void loadAll();
  }, []);

  // Cross-tab events (BroadcastChannel — same browser).
  // Filter by forUserId so events meant for other logged-in users in other tabs
  // are ignored. Without this, e.g. Alice creating a doc in tab A would leak
  // into Bob's sidebar in tab B.
  useDocEvents(event => {
    if (event.forUserId !== currentUserId) return;
    switch (event.type) {
      case 'created':
        setDocuments(prev =>
          prev.some(d => d.id === event.doc.id) ? prev : [event.doc, ...prev],
        );
        break;
      case 'soft-deleted':
        setDocuments(prev => prev.filter(d => d.id !== event.doc.id));
        setTrashDocs(prev =>
          prev.some(d => d.id === event.doc.id) ? prev : [event.doc, ...prev],
        );
        if (location.pathname === `/documents/${event.doc.id}`) navigate('/');
        break;
      case 'restored':
        setTrashDocs(prev => prev.filter(d => d.id !== event.doc.id));
        setDocuments(prev =>
          prev.some(d => d.id === event.doc.id) ? prev : [event.doc, ...prev],
        );
        break;
      case 'permanent-deleted':
        setTrashDocs(prev => prev.filter(d => d.id !== event.docId));
        if (location.pathname === `/documents/${event.docId}`) navigate('/');
        break;
      case 'share-added':
        // A doc was just shared with us — refetch from server so the new entry
        // appears with full owner info, permission, etc.
        void loadAll();
        break;
      case 'share-revoked':
        // Sister tab told us we were revoked from a doc; mirror the cleanup.
        setSharedDocs(prev => prev.filter(d => d.id !== event.docId));
        if (location.pathname === `/documents/${event.docId}`) navigate('/');
        break;
      case 'shared-doc-soft-deleted':
        // Owner sent the doc to trash; we no longer have read access.
        setSharedDocs(prev => prev.filter(d => d.id !== event.docId));
        if (location.pathname === `/documents/${event.docId}`) navigate('/');
        break;
      case 'shared-doc-restored':
        // Owner restored the doc; refetch to bring it back into the sidebar.
        void loadAll();
        break;
      case 'shared-doc-permanently-deleted':
        setSharedDocs(prev => prev.filter(d => d.id !== event.docId));
        if (location.pathname === `/documents/${event.docId}`) navigate('/');
        break;
    }
  });

  async function loadAll() {
    try {
      const [active, trash] = await Promise.all([listDocuments(), listTrash()]);
      // Server returns owner + shared in one list; split client-side by permission.
      setDocuments(active.documents.filter(d => d.permission === 'owner'));
      setSharedDocs(active.documents.filter(d => d.permission === 'editor'));
      setTrashDocs(trash.documents);
    } catch {
      setLoadError(true);
    }
  }

  async function handleCreate() {
    const res = await createDocument();
    setDocuments(prev => [res.document, ...prev]);
    broadcastDocEvent({ type: 'created', forUserId: currentUserId, doc: res.document });
    navigate(`/documents/${res.document.id}`);
  }

  async function handleDelete(id: string) {
    // Only owner can delete; the UI already hides the button for shared docs.
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const res = await deleteDocument(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    const trashedDoc = { ...doc, deletedAt: new Date().toISOString() };
    setTrashDocs(prev => [trashedDoc, ...prev]);
    broadcastDocEvent({ type: 'soft-deleted', forUserId: currentUserId, doc: trashedDoc });
    // Tell each shared editor's tab to drop the doc from their sidebar.
    res.affectedUserIds.forEach(userId => {
      broadcastDocEvent({ type: 'shared-doc-soft-deleted', forUserId: userId, docId: id });
    });
    navigate('/');
  }

  async function handlePermanentDelete(id: string) {
    const res = await permanentlyDeleteDocument(id);
    setTrashDocs(prev => prev.filter(d => d.id !== id));
    broadcastDocEvent({ type: 'permanent-deleted', forUserId: currentUserId, docId: id });
    res.affectedUserIds.forEach(userId => {
      broadcastDocEvent({
        type: 'shared-doc-permanently-deleted',
        forUserId: userId,
        docId: id,
      });
    });
  }

  async function handleRestore(id: string) {
    const res = await restoreDocument(id);
    setTrashDocs(prev => prev.filter(d => d.id !== id));
    setDocuments(prev => [res.document, ...prev]);
    broadcastDocEvent({ type: 'restored', forUserId: currentUserId, doc: res.document });
    // Each shared editor refetches so the doc reappears in their sidebar.
    res.affectedUserIds.forEach(userId => {
      broadcastDocEvent({ type: 'shared-doc-restored', forUserId: userId });
    });
    navigate(`/documents/${res.document.id}`);
  }

  // Title updates from auto-save; mirrors into whichever list (own or shared) holds it.
  function handleUpdate(id: string, title: string) {
    setDocuments(prev => prev.map(d => (d.id === id ? { ...d, title } : d)));
    setSharedDocs(prev => prev.map(d => (d.id === id ? { ...d, title } : d)));
  }

  function handleRevokedFromDoc(id: string) {
    setSharedDocs(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="workspace">
      <Sidebar
        documents={documents}
        sharedDocs={sharedDocs}
        trashDocs={trashDocs}
        onCreateDocument={() => void handleCreate()}
        onDeleteDocument={id => void handleDelete(id)}
        onRestoreDocument={id => void handleRestore(id)}
        onPermanentDeleteDocument={id => void handlePermanentDelete(id)}
      />
      <div className="workspace-content">
        <header className="workspace-header">
          <div />
          <div className="dashboard-user">
            <span className="muted">{user?.name ?? user?.email}</span>
            <button onClick={logout} className="btn-secondary">
              Logout
            </button>
          </div>
        </header>
        {loadError && (
          <div className="workspace-error-banner">
            Could not load documents.{' '}
            <button
              className="btn-link"
              onClick={() => { setLoadError(false); void loadAll(); }}
            >
              Retry
            </button>
          </div>
        )}
        <main className="workspace-main">
          <Outlet context={{
            onDelete: handleDelete,
            onUpdate: handleUpdate,
            onRevokedFromDoc: handleRevokedFromDoc,
          } satisfies WorkspaceOutletContext} />
        </main>
      </div>
    </div>
  );
}
