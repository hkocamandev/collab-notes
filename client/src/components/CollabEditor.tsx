import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import Collaboration from '@tiptap/extension-collaboration';
import { createLowlight, common } from 'lowlight';
import SlashCommand from '../extensions/SlashCommand.js';
import type { Document } from '../documents/api.js';
import { useYjsCache } from '../lib/yjsCache.js';

const lowlight = createLowlight(common);

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

const PALETTE = ['#e03c3c', '#e07c3c', '#3c9e3c', '#3c6ee0', '#8b3ce0', '#3cb8b8'];

function userColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

export interface AwarenessUser {
  name: string;
  color: string;
  clientId: number;
}

type Props = {
  doc: Document;
  userName: string;
  userId: string;
  onContentChange: (html: string) => void;
  onSeedComplete?: (html: string) => void;
  onEditorReady: (editor: TiptapEditor | null) => void;
  onSelectionUpdate: () => void;
  onPresenceChange: (users: AwarenessUser[]) => void;
  // Called when a peer (the doc owner) signals that this user's access has been
  // revoked. Parent should navigate the user out of the document.
  onRevoked?: () => void;
  loadedRef: React.MutableRefObject<boolean>;
};

export default function CollabEditor({
  doc,
  userName,
  userId,
  onContentChange,
  onSeedComplete,
  onEditorReady,
  onSelectionUpdate,
  onPresenceChange,
  onRevoked,
  loadedRef,
}: Props) {
  // Pull the Yjs doc + provider from the shared module cache (StrictMode-safe).
  // DocumentPage uses the same cache for the title; the refcount keeps things tidy.
  const { ydoc, provider } = useYjsCache(doc.id);
  const color = userColor(userId || 'anon');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
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
      onContentChange(editor.getHTML());
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
    onSelectionUpdate,
  });

  // Seed DB content into the Yjs doc when the fragment is empty.
  // Fires on WS sync event OR after a 1 s fallback (covers offline / slow WS).
  useEffect(() => {
    if (!editor) return;

    let done = false;

    const doSeed = () => {
      if (done) return;
      const fragment = ydoc.getXmlFragment('default');
      // "[]" is the legacy DB default for an empty doc — treat as no content
      const hasDbContent = doc.content && doc.content !== '[]';
      if (fragment.length > 0 || !hasDbContent) return;

      done = true;
      loadedRef.current = false;
      editor.commands.setContent(doc.content);
      loadedRef.current = true;

      // Sync content state in parent so auto-save doesn't fire spuriously
      const seededHtml = editor.getHTML();
      onContentChange(seededHtml);
      onSeedComplete?.(seededHtml);
    };

    if (provider.synced) {
      doSeed();
      return;
    }

    provider.once('sync', doSeed);
    // Fallback: WS not connected (or slow) — seed from DB after 2 s.
    // Two seconds gives BroadcastChannel/cross-tab sync time to populate the
    // fragment first, so a tab joining a doc another tab is already editing
    // does not stomp on the in-memory state by re-seeding from DB.
    const fallback = window.setTimeout(doSeed, 2000);

    return () => {
      window.clearTimeout(fallback);
      provider.off('sync', doSeed);
    };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presence + revoke detection: track peers via awareness.
  useEffect(() => {
    provider.awareness.setLocalStateField('user', { name: userName || 'Anonymous', color });

    const updatePresence = () => {
      const users: AwarenessUser[] = [];
      let revokedSelf = false;

      provider.awareness.getStates().forEach((state, clientId) => {
        const peer = state as {
          user?: { name: string; color: string };
          revokedUserIds?: string[];
        };
        if (clientId !== provider.awareness.clientID && peer.user) {
          users.push({ ...peer.user, clientId });
        }
        // Any peer (typically the owner) may have signalled a revocation.
        if (
          userId &&
          Array.isArray(peer.revokedUserIds) &&
          peer.revokedUserIds.includes(userId)
        ) {
          revokedSelf = true;
        }
      });

      onPresenceChange(users);
      if (revokedSelf) onRevoked?.();
    };

    provider.awareness.on('change', updatePresence);
    // Capture state that was already populated before this listener attached.
    // Without this, late-joining tabs miss the initial 'change' event that fires
    // when the server pushes existing peers' awareness on first connect.
    updatePresence();
    return () => provider.awareness.off('change', updatePresence);
  }, [userName, color, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report editor instance to parent for FormatToolbar
  useEffect(() => {
    onEditorReady(editor);
    return () => onEditorReady(null);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const storage = editor?.storage as
    | { characterCount?: { words: () => number; characters: () => number } }
    | undefined;
  const words = storage?.characterCount?.words() ?? 0;
  const chars = storage?.characterCount?.characters() ?? 0;

  return (
    <div className="editor-wrapper">
      <EditorContent editor={editor} className="editor-content" />
      <div className="editor-footer">
        <span className="editor-count">
          {words} words · {chars} chars
        </span>
      </div>
    </div>
  );
}
