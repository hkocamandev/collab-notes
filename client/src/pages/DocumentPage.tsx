import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { type Document, getDocument, updateDocument } from '../documents/api.js';
import type { WorkspaceOutletContext } from './WorkspaceLayout.js';

type SaveState = 'idle' | 'saving' | 'saved';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { onDelete, onUpdate } = useOutletContext<WorkspaceOutletContext>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notFound, setNotFound] = useState(false);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    loadedRef.current = false;
    setNotFound(false);
    setDoc(null);
    void loadDoc(id);
  }, [id]);

  async function loadDoc(docId: string) {
    try {
      const res = await getDocument(docId);
      setDoc(res.document);
      setTitle(res.document.title);
      setContent(res.document.content);
      loadedRef.current = true;
    } catch {
      setNotFound(true);
    }
  }

  // Debounced auto-save — only fires after initial load
  useEffect(() => {
    if (!loadedRef.current || !id) return;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        await updateDocument(id, { title, content });
        onUpdate(id, title);
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    if (!id) return;
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
    return <div className="doc-empty"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <span className={`save-status save-status--${saveState}`}>
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
        </span>
        <button
          className="btn-secondary btn-danger"
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>

      <input
        className="doc-title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Untitled"
        aria-label="Document title"
      />

      <textarea
        className="doc-content"
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Start writing…"
        aria-label="Document content"
      />
    </div>
  );
}
