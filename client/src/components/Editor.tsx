import { EditorContent } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';

type Props = {
  editor: TiptapEditor | null;
};

export default function Editor({ editor }: Props) {
  const storage = editor?.storage as { characterCount?: { words: () => number; characters: () => number } } | undefined;
  const words = storage?.characterCount?.words() ?? 0;
  const chars = storage?.characterCount?.characters() ?? 0;

  return (
    <div className="editor-wrapper">
      <EditorContent editor={editor} className="editor-content" />
      <div className="editor-footer">
        <span className="editor-count">{words} words · {chars} chars</span>
      </div>
    </div>
  );
}
