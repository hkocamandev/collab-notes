import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type SlashCommandItem = {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: any; range: any }) => void;
};

type Props = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
};

export type SlashMenuHandle = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

const SlashMenu = forwardRef<SlashMenuHandle, Props>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i - 1 + props.items.length) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = props.items[selectedIndex];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <div className="slash-menu">
        <p className="slash-menu-empty">No results</p>
      </div>
    );
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          className={`slash-menu-item${i === selectedIndex ? ' active' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            props.command(item);
          }}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <span className="slash-menu-text">
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashMenu.displayName = 'SlashMenu';
export default SlashMenu;
