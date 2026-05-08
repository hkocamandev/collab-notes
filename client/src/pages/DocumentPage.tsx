import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import { createLowlight, common } from 'lowlight';
import { type Document, getDocument, updateDocument } from '../documents/api.js';
import type { WorkspaceOutletContext } from './WorkspaceLayout.js';
import Editor from '../components/Editor.js';
import FormatToolbar from '../components/FormatToolbar.js';
import SlashCommand from '../extensions/SlashCommand.js';

const lowlight = createLowlight(common);

// Intercepts Tab so it inserts spaces instead of shifting browser focus.
// Priority 50 runs after StarterKit (100), so list Tab-indent still works.
const TabKey = Extension.create({
  name: 'tabKey',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent('\t');
        }
        return this.editor.commands.insertContent('  ');
      },
    };
  },
});

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
  const lastSavedRef = useRef({ title: '', content: '' });

  // Forces re-render on cursor move so FormatToolbar active states stay fresh
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: 'Start writing… or type / for commands' }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'javascript' }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      CharacterCount,
      Typography,
      SlashCommand,
      TabKey,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!loadedRef.current) return;
      setContent(editor.getHTML());
      // Scroll workspace-main so the cursor stays visible
      requestAnimationFrame(() => {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const scrollEl = document.querySelector<HTMLElement>('.workspace-main');
        if (!scrollEl) return;
        const rect = scrollEl.getBoundingClientRect();
        const margin = 40;
        if (coords.bottom > rect.bottom - margin) {
          scrollEl.scrollTop += coords.bottom - rect.bottom + margin;
        }
        if (coords.top < rect.top + margin) {
          scrollEl.scrollTop -= rect.top - coords.top + margin;
        }
      });
    },
    onSelectionUpdate: () => forceUpdate(),
  });

  // Seed editor with doc content each time the document changes
  useEffect(() => {
    if (!editor || !doc) return;
    const prev = loadedRef.current;
    loadedRef.current = false;               // suppress onUpdate during setContent
    editor.commands.setContent(doc.content || '');
    loadedRef.current = prev;
  }, [editor, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
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
      setTitle(res.document.title);
      setContent(res.document.content);
      lastSavedRef.current = { title: res.document.title, content: res.document.content };
      loadedRef.current = true;
    } catch {
      setNotFound(true);
    }
  }

  // Debounced auto-save
  useEffect(() => {
    if (!loadedRef.current || !id) return;
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

  async function handleDelete() {
    if (!id) return;
    await onDelete(id);
  }

  if (notFound) {
    return (
      <div className="doc-empty">
        <p className="muted">Document not found.</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>Go back</button>
      </div>
    );
  }

  if (!doc) {
    return <div className="doc-empty"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="doc-page">
      <div className="doc-toolbar">
        <FormatToolbar editor={editor} />
        <div className="doc-toolbar-actions">
          <span
            className={`save-dot save-dot--${saveState}`}
            data-tooltip={saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : undefined}
            aria-label={saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : undefined}
          />
          <button
            className="btn-secondary btn-danger"
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="doc-paper">
        <input
          className="doc-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Document title"
        />
        <Editor editor={editor} />
      </div>
    </div>
  );
}
