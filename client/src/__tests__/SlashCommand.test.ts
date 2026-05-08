import { describe, it, expect, vi } from 'vitest';
import { slashCommandItems } from '../extensions/SlashCommand';

describe('slashCommandItems', () => {
  const titles = slashCommandItems.map(i => i.title);

  it('includes all heading levels', () => {
    expect(titles).toContain('Heading 1');
    expect(titles).toContain('Heading 2');
    expect(titles).toContain('Heading 3');
  });

  it('includes list types', () => {
    expect(titles).toContain('Bullet List');
    expect(titles).toContain('Numbered List');
    expect(titles).toContain('Task List');
  });

  it('includes code block', () => {
    expect(titles).toContain('Code Block');
  });

  it('includes blockquote and divider', () => {
    expect(titles).toContain('Blockquote');
    expect(titles).toContain('Divider');
  });

  it('includes inline formatting commands', () => {
    expect(titles).toContain('Bold');
    expect(titles).toContain('Italic');
    expect(titles).toContain('Underline');
  });

  it('every item has title, description, icon, and command', () => {
    for (const item of slashCommandItems) {
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(typeof item.command).toBe('function');
    }
  });

  it('each command calls chain().focus() on the editor', () => {
    const runMock = vi.fn();
    const chainMock = {
      focus: vi.fn().mockReturnThis(),
      deleteRange: vi.fn().mockReturnThis(),
      setNode: vi.fn().mockReturnThis(),
      toggleBulletList: vi.fn().mockReturnThis(),
      toggleOrderedList: vi.fn().mockReturnThis(),
      toggleTaskList: vi.fn().mockReturnThis(),
      setCodeBlock: vi.fn().mockReturnThis(),
      setBlockquote: vi.fn().mockReturnThis(),
      setHorizontalRule: vi.fn().mockReturnThis(),
      toggleBold: vi.fn().mockReturnThis(),
      toggleItalic: vi.fn().mockReturnThis(),
      toggleUnderline: vi.fn().mockReturnThis(),
      run: runMock,
    };
    const editorMock = { chain: vi.fn().mockReturnValue(chainMock) };

    for (const item of slashCommandItems) {
      item.command({ editor: editorMock, range: { from: 0, to: 1 } });
    }

    expect(editorMock.chain).toHaveBeenCalledTimes(slashCommandItems.length);
    expect(chainMock.focus).toHaveBeenCalledTimes(slashCommandItems.length);
    expect(runMock).toHaveBeenCalledTimes(slashCommandItems.length);
  });
});
