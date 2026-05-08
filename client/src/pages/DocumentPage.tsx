// Single-document view.
//
// The outer DocumentPage just reads the route :id and renders
// DocumentPageBody with key={id} so a navigation between docs cleanly
// resets all state (Yjs cache acquire, loadedRef, save state, …) without
// custom teardown.
//
// DocumentPageBody owns the title (Y.Text via useCollabTitle), local
// content state for auto-save, presence list, plus the Share / History
// modal toggles. It composes:
//   - FormatToolbar (active mark/blocks, controlled by editor state)
//   - CollabEditor (Tiptap + Yjs binding, presence, revoke detection)
//   - ShareModal / VersionHistoryModal (lazy-mounted via state)
// Permission gates Share / Delete / Export PDF visibility.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { type Document, getDocument, updateDocument } from '../documents/api.js';
import type { WorkspaceOutletContext } from './WorkspaceLayout.js';
import FormatToolbar from '../components/FormatToolbar.js';
import CollabEditor, { type AwarenessUser } from '../components/CollabEditor.js';
import ErrorBoundary from '../components/ErrorBoundary.js';
import ShareModal from '../components/ShareModal.js';
import VersionHistoryModal from '../components/VersionHistoryModal.js';
import { useAuth } from '../auth/AuthContext.js';
import { useCollabTitle } from '../lib/yjsCache.js';
import { broadcastDocEvent } from '../lib/docEvents.js';

type SaveState = 'idle' | 'saving' | 'saved';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  // key={id} ensures all child state (including the Yjs cache acquire keyed by id)
  // resets when navigating between documents.
  return <DocumentPageBody key={id} id={id} />;
}

function DocumentPageBody({ id }: { id: string }) {
  const { onDelete, onUpdate, onRevokedFromDoc } = useOutletContext<WorkspaceOutletContext>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle, seedTitleIfEmpty] = useCollabTitle(id);
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notFound, setNotFound] = useState(false);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [presence, setPresence] = useState<AwarenessUser[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef({ title: '', content: '' });

  // forceUpdate is called by CollabEditor on selection changes to keep FormatToolbar active states fresh
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    loadedRef.current = false;
    setNotFound(false);
    setDoc(null);
    setSaveState('idle');
    void loadDoc(id);
  }, [id]);

  async function loadDoc(docId: string) {
    try {
      const res = await getDocument(docId);
      setDoc(res.document);
      // Seed Y.Text 'title' from DB only if no other tab has populated it yet.
      // Cross-tab updates flow through Yjs after this.
      seedTitleIfEmpty(res.document.title);
      setContent(res.document.content);
      lastSavedRef.current = { title: res.document.title, content: res.document.content };
      loadedRef.current = true;
    } catch {
      setNotFound(true);
    }
  }

  // Debounced auto-save. `title` updates whenever any tab edits Y.Text 'title',
  // so this still saves cross-tab changes to DB (idempotent if multiple tabs save).
  useEffect(() => {
    if (!loadedRef.current) return;
    if (title === lastSavedRef.current.title && content === lastSavedRef.current.content) return;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        await updateDocument(id, { title, content });
        onUpdate(id, title);
        lastSavedRef.current = { title, content };
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Called by CollabEditor after seeding DB content into the editor.
  // Keeps lastSavedRef in sync so the debounce doesn't fire a spurious save on load.
  const handleSeedComplete = useCallback(
    (html: string) => {
      lastSavedRef.current = { ...lastSavedRef.current, content: html };
    },
    [],
  );

  const currentUserId = user?.id ?? '';
  const handleRevoked = useCallback(() => {
    // Owner revoked our access while we had the doc open. Remove from sidebar
    // and bounce to home — without a re-fetch the API would now 404 on save.
    onRevokedFromDoc(id);
    // Notify our own other tabs (same browser) so their sidebars cleanup too.
    if (currentUserId) {
      broadcastDocEvent({ type: 'share-revoked', forUserId: currentUserId, docId: id });
    }
    navigate('/');
  }, [id, onRevokedFromDoc, navigate, currentUserId]);

  async function handleDelete() {
    await onDelete(id);
  }

  if (notFound) {
    return (
      <div className="doc-empty">
        <p className="muted">Document not found.</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Go back
        </button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="doc-empty">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <FormatToolbar editor={editor} />
        <div className="doc-toolbar-actions">
          {presence.length > 0 && (
            <div className="presence-dots" aria-label={`${presence.length} other user(s) editing`}>
              {presence.slice(0, 4).map(u => (
                <span
                  key={u.clientId}
                  className="presence-dot"
                  style={{ backgroundColor: u.color }}
                  data-tooltip={u.name}
                  aria-label={u.name}
                >
                  {u.name.charAt(0).toUpperCase()}
                </span>
              ))}
              {presence.length > 4 && (
                <span className="presence-dot presence-dot--overflow">+{presence.length - 4}</span>
              )}
            </div>
          )}
          <span
            className={`save-dot save-dot--${saveState}`}
            data-tooltip={
              saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : undefined
            }
            aria-label={
              saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : undefined
            }
          />
          {/* History button: visible to anyone with access (owner OR editor). */}
          <button
            className="btn-secondary"
            onClick={() => setHistoryOpen(true)}
            aria-label="View version history"
          >
            History
          </button>
          {doc.permission === 'owner' && (
            <>
              <button
                className="btn-secondary"
                onClick={() => setShareOpen(true)}
                aria-label={
                  (doc.shareCount ?? 0) > 0
                    ? `Share — ${doc.shareCount} ${doc.shareCount === 1 ? 'person has' : 'people have'} access`
                    : 'Share'
                }
              >
                Share
                {(doc.shareCount ?? 0) > 0 && (
                  <span className="share-count-badge">{doc.shareCount}</span>
                )}
              </button>
              <button className="btn-secondary btn-danger" onClick={() => void handleDelete()}>
                Delete
              </button>
              <button
                className="btn-secondary"
                disabled
                title="PDF export — coming soon"
                aria-label="Export PDF (coming soon)"
              >
                Export PDF
              </button>
            </>
          )}
          {doc.permission === 'editor' && doc.ownerEmail && (
            <span className="muted doc-shared-by" title={`Shared by ${doc.ownerEmail}`}>
              Shared by {doc.ownerName ?? doc.ownerEmail}
            </span>
          )}
        </div>
      </div>

      {shareOpen && (
        <ShareModal
          documentId={id}
          documentTitle={title}
          onClose={() => setShareOpen(false)}
          onSharesChanged={count =>
            setDoc(prev => (prev ? { ...prev, shareCount: count } : prev))
          }
          onJumpToEnd={() => editor?.chain().focus('end').run()}
        />
      )}

      {historyOpen && (
        <VersionHistoryModal
          documentId={id}
          documentTitle={title}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className="doc-paper">
        <input
          className="doc-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Document title"
        />
        <ErrorBoundary
          fallback={
            <div className="doc-empty">
              <p className="muted">Editor failed to load. Please refresh the page.</p>
            </div>
          }
        >
          <CollabEditor
            doc={doc}
            userName={user?.name ?? user?.email ?? 'Anonymous'}
            userId={user?.id ?? ''}
            onContentChange={setContent}
            onSeedComplete={handleSeedComplete}
            onEditorReady={setEditor}
            onSelectionUpdate={forceUpdate}
            onPresenceChange={setPresence}
            onRevoked={handleRevoked}
            loadedRef={loadedRef}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
