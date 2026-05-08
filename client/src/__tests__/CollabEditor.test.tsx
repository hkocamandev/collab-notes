import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';

// Shared mock state (mutated per test via beforeEach)
const mockAwareness = {
  setLocalStateField: vi.fn(),
  getStates: vi.fn(() => new Map()),
  on: vi.fn(),
  off: vi.fn(),
  clientID: 1,
};

const mockProvider = {
  synced: true,
  awareness: mockAwareness,
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
};

// Mock Yjs and y-websocket before importing the component
vi.mock('yjs', () => {
  const fakeFragment = { length: 0 };
  class MockDoc {
    getXmlFragment = vi.fn(() => fakeFragment);
    destroy = vi.fn();
    on = vi.fn();
  }
  return { Doc: MockDoc };
});

vi.mock('y-websocket', () => ({
  WebsocketProvider: class MockProvider {
    synced = mockProvider.synced;
    awareness = mockProvider.awareness;
    once = mockProvider.once;
    on = mockProvider.on;
    off = mockProvider.off;
    destroy = mockProvider.destroy;
  },
}));

vi.mock('@tiptap/extension-collaboration', () => ({ default: { configure: vi.fn(() => ({})) } }));
vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => <div data-testid="editor-content" />,
}));
vi.mock('../extensions/SlashCommand', () => ({ default: {} }));

import CollabEditor from '../components/CollabEditor';
import type { AwarenessUser } from '../components/CollabEditor';
import { __resetYjsCacheForTests } from '../lib/yjsCache';

const FAKE_DOC = {
  id: 'doc-1',
  title: 'Test',
  content: '<p>Hello</p>',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  permission: 'owner' as const,
  ownerEmail: null,
  ownerName: null,
  shareCount: 0,
};

type WrapperProps = {
  onContentChange?: (html: string) => void;
  onSeedComplete?: (html: string) => void;
  onEditorReady?: Parameters<typeof CollabEditor>[0]['onEditorReady'];
  onSelectionUpdate?: () => void;
  onPresenceChange?: (users: AwarenessUser[]) => void;
  onRevoked?: () => void;
  userId?: string;
};

function Wrapper({
  onContentChange = vi.fn(),
  onSeedComplete = vi.fn(),
  onEditorReady = vi.fn(),
  onSelectionUpdate = vi.fn(),
  onPresenceChange = vi.fn(),
  onRevoked,
  userId = 'user-1',
}: WrapperProps = {}) {
  const loadedRef = useRef(false);
  return (
    <CollabEditor
      doc={FAKE_DOC}
      userName="Alice"
      userId={userId}
      onContentChange={onContentChange}
      onSeedComplete={onSeedComplete}
      onEditorReady={onEditorReady}
      onSelectionUpdate={onSelectionUpdate}
      onPresenceChange={onPresenceChange}
      onRevoked={onRevoked}
      loadedRef={loadedRef}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetYjsCacheForTests();
  mockProvider.synced = true;
  mockAwareness.getStates.mockReturnValue(new Map());
});

describe('CollabEditor', () => {
  it('renders the editor content area', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('editor-content')).toBeDefined();
  });

  it('shows word and char count footer', () => {
    render(<Wrapper />);
    expect(screen.getByText(/words/)).toBeDefined();
    expect(screen.getByText(/chars/)).toBeDefined();
  });

  it('calls onEditorReady with null when editor is null', async () => {
    const onEditorReady = vi.fn();
    render(<Wrapper onEditorReady={onEditorReady} />);
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledWith(null));
  });

  it('sets local awareness state with user name and color', async () => {
    render(<Wrapper />);
    await waitFor(() =>
      expect(mockAwareness.setLocalStateField).toHaveBeenCalledWith('user', {
        name: 'Alice',
        color: expect.any(String),
      }),
    );
  });

  it('calls awareness.on to track presence changes', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(mockAwareness.on).toHaveBeenCalledWith('change', expect.any(Function)));
  });

  it('does not include current user in presence list', async () => {
    const otherUser = { name: 'Bob', color: '#ff0000' };
    mockAwareness.getStates.mockReturnValue(
      new Map([
        [1, { user: { name: 'Alice', color: '#aaa' } }], // clientID 1 = self
        [2, { user: otherUser }],
      ]),
    );
    const onPresenceChange = vi.fn();
    render(<Wrapper onPresenceChange={onPresenceChange} />);

    // Trigger the awareness change handler
    const changeHandler = mockAwareness.on.mock.calls.find(([event]) => event === 'change')?.[1];
    if (changeHandler) changeHandler();

    await waitFor(() => {
      const calls = onPresenceChange.mock.calls;
      if (calls.length === 0) return;
      const lastCall = calls[calls.length - 1]?.[0] as AwarenessUser[];
      // Self (clientID 1) should not be in the list
      expect(lastCall.every(u => u.clientId !== 1)).toBe(true);
    });
  });

  it('calls onRevoked when a peer signals our userId in revokedUserIds', async () => {
    // Peer (the doc owner, clientID 2) has us (user-1) listed as revoked.
    mockAwareness.getStates.mockReturnValue(
      new Map([
        [1, { user: { name: 'Bob', color: '#aaa' } }], // self
        [2, { user: { name: 'Alice', color: '#bbb' }, revokedUserIds: ['user-1'] }],
      ]),
    );
    const onRevoked = vi.fn();
    render(<Wrapper userId="user-1" onRevoked={onRevoked} />);
    await waitFor(() => expect(onRevoked).toHaveBeenCalled());
  });

  it('does not call onRevoked when revokedUserIds does not include our userId', async () => {
    mockAwareness.getStates.mockReturnValue(
      new Map([
        [1, { user: { name: 'Bob', color: '#aaa' } }],
        [2, { user: { name: 'Alice', color: '#bbb' }, revokedUserIds: ['someone-else'] }],
      ]),
    );
    const onRevoked = vi.fn();
    render(<Wrapper userId="user-1" onRevoked={onRevoked} />);
    // Wait a tick for the initial updatePresence call
    await new Promise(r => setTimeout(r, 10));
    expect(onRevoked).not.toHaveBeenCalled();
  });
});
