import type { Editor } from '@tiptap/core';

type ToolItem =
  | { label: string; tooltip: string; action: () => void; isActive: () => boolean }
  | 'sep';

function buildTools(editor: Editor): ToolItem[] {
  return [
    { label: 'H1', tooltip: 'Heading 1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor.isActive('heading', { level: 1 }) },
    { label: 'H2', tooltip: 'Heading 2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', tooltip: 'Heading 3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: () => editor.isActive('heading', { level: 3 }) },
    'sep',
    { label: '•', tooltip: 'Bullet List', action: () => editor.chain().focus().toggleBulletList().run(), isActive: () => editor.isActive('bulletList') },
    { label: '1.', tooltip: 'Numbered List', action: () => editor.chain().focus().toggleOrderedList().run(), isActive: () => editor.isActive('orderedList') },
    { label: '☐', tooltip: 'Task List', action: () => editor.chain().focus().toggleTaskList().run(), isActive: () => editor.isActive('taskList') },
    'sep',
    { label: '</>', tooltip: 'Code Block', action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: () => editor.isActive('codeBlock') },
    { label: '"', tooltip: 'Blockquote', action: () => editor.chain().focus().toggleBlockquote().run(), isActive: () => editor.isActive('blockquote') },
    { label: '—', tooltip: 'Divider', action: () => editor.chain().focus().setHorizontalRule().run(), isActive: () => false },
    'sep',
    { label: 'B', tooltip: 'Bold', action: () => editor.chain().focus().toggleBold().run(), isActive: () => editor.isActive('bold') },
    { label: 'I', tooltip: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), isActive: () => editor.isActive('italic') },
    { label: 'U', tooltip: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), isActive: () => editor.isActive('underline') },
  ];
}

export default function FormatToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const tools = buildTools(editor);

  return (
    <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
      {tools.map((tool, i) => {
        if (tool === 'sep') return <span key={`sep-${i}`} className="format-sep" aria-hidden />;
        return (
          <button
            key={tool.label}
            className={`format-btn${tool.isActive() ? ' active' : ''}`}
            title={tool.tooltip}
            aria-label={tool.tooltip}
            aria-pressed={tool.isActive()}
            onMouseDown={e => {
              e.preventDefault();
              tool.action();
            }}
          >
            {tool.label}
          </button>
        );
      })}
    </div>
  );
}
