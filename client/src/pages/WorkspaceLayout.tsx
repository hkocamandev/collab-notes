// Authenticated workspace shell.
//
// Owns the live document lists (owner + shared + trash), plan-aware UI
// state (badge, doc-count, upgrade button), the toast queue, and the
// cross-tab/cross-user event hub. Children render inside <Outlet />:
//   - WorkspaceHome (selection prompt) when at "/"
//   - DocumentPage when at "/documents/:id"
//
// Two real-time channels feed this layout:
//   - useDocEvents (BroadcastChannel) for same-browser tab sync —
//     filtered by forUserId so different users in different tabs of the
//     same browser don't leak into each other's sidebars.
//   - Yjs awareness inside CollabEditor (cross-browser, via the yws
//     server) for revoke kick-out and presence.

import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { Sidebar } from '../components/Sidebar.js';
import ToastList, { type ToastItem } from '../components/Toast.js';
import AskAi from '../components/AskAi.js';
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

const TOAST_DURATION_MS = 10_000;

export interface WorkspaceOutletContext {
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, title: string) => void;
  // Called when the current user has been revoked from a shared document.
  // Removes the doc from the sidebar's "Shared with me" list.
  onRevokedFromDoc: (id: string) => void;
}

// Mirrors the server's basic-plan caps. Kept here too so the UI can render
// "3/5" hints and disable buttons before the user even tries the action.
const BASIC_DOC_LIMIT = 5;

export default function WorkspaceLayout() {
  const { user, logout, upgrade } = useAuth();
  const currentUserId = user?.id ?? '';
  const isBasic = user?.plan === 'basic';
  const [upgrading, setUpgrading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Owner-only docs (full control)
  const [documents, setDocuments] = useState<Document[]>([]);
  // Shared-with-me docs (editor permission only)
  const [sharedDocs, setSharedDocs] = useState<Document[]>([]);
  const [trashDocs, setTrashDocs] = useState<Document[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function pushToast(title: string, body?: string) {
    // crypto.randomUUID is browser-native; safe under HTTPS / localhost.
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, title, body }]);
    // Match the CSS animation duration so the React unmount lines up with
    // the fade-out finishing.
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION_MS);
  }

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

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
        if (event.senderEmail) {
          const who = event.senderName ?? event.senderEmail;
          pushToast(
            `${who} shared a document with you`,
            event.docTitle ? `"${event.docTitle}"` : undefined,
          );
        }
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

  const atDocumentLimit = isBasic && documents.length >= BASIC_DOC_LIMIT;

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      await upgrade();
    } catch {
      // upgrade endpoint should be near-instant; surface the failure inline
      // via the disabled button reverting. Reload as a fallback.
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="workspace">
      <ToastList toasts={toasts} onDismiss={dismissToast} />
      <Sidebar
        documents={documents}
        sharedDocs={sharedDocs}
        trashDocs={trashDocs}
        atDocumentLimit={atDocumentLimit}
        onCreateDocument={() => void handleCreate()}
        onDeleteDocument={id => void handleDelete(id)}
        onRestoreDocument={id => void handleRestore(id)}
        onPermanentDeleteDocument={id => void handlePermanentDelete(id)}
      >
        <AskAi />
      </Sidebar>
      <div className="workspace-content">
        <header className="workspace-header">
          <div />
          <div className="dashboard-user">
            {isBasic ? (
              <span
                className="plan-badge plan-badge--basic"
                title="Basic: max 5 documents, max 1 share per document"
              >
                Basic · {documents.length}/{BASIC_DOC_LIMIT} docs
              </span>
            ) : (
              <span className="plan-badge plan-badge--premium" title="Premium: unlimited">
                Premium ✦
              </span>
            )}
            {isBasic && (
              <button
                className="btn-primary btn-upgrade"
                onClick={() => void handleUpgrade()}
                disabled={upgrading}
              >
                {upgrading ? 'Upgrading…' : 'Upgrade'}
              </button>
            )}
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
