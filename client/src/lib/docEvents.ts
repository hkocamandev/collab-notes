import { useEffect, useRef } from 'react';
import type { Document } from '../documents/api.js';

// Cross-tab document lifecycle events. Sent over BroadcastChannel so other tabs
// in the same browser update their sidebar / current view without refreshing.
// Cross-device sync (e.g. multiple computers) would need a server-side channel —
// out of scope for now.
//
// `forUserId` is the userId whose state should react to this event. The receiver
// must check `forUserId === currentUserId` and ignore events meant for other
// users — needed because BroadcastChannel is shared across all same-origin tabs
// and we may have different users logged in (sessionStorage isolates auth, but
// not BroadcastChannel).
export type DocEvent =
  | { type: 'created'; forUserId: string; doc: Document }
  | { type: 'soft-deleted'; forUserId: string; doc: Document }
  | { type: 'restored'; forUserId: string; doc: Document }
  | { type: 'permanent-deleted'; forUserId: string; docId: string }
  // share-added: recipient's tabs refetch their sidebar to pick up the new entry.
  // Sender is the owner; forUserId is the recipient.
  | { type: 'share-added'; forUserId: string }
  // share-revoked: emitted by the recipient's open doc tab (after detecting the
  // revoke via Yjs awareness) so their other tabs (e.g. home) update the sidebar.
  | { type: 'share-revoked'; forUserId: string; docId: string }
  // shared-doc-soft-deleted: owner moved a shared doc to trash. Recipients lose
  // access (server returns 404) so their sidebars must drop the entry.
  | { type: 'shared-doc-soft-deleted'; forUserId: string; docId: string }
  // shared-doc-restored: owner restored a previously-trashed shared doc. The
  // share record persisted, so recipients refetch their sidebar to bring it back.
  | { type: 'shared-doc-restored'; forUserId: string }
  // shared-doc-permanently-deleted: owner permanently deleted; cascade wiped
  // the share. Recipients drop the entry if it somehow still appears.
  | { type: 'shared-doc-permanently-deleted'; forUserId: string; docId: string };

const CHANNEL_NAME = 'collab-notes-doc-events';

// Lazy init: happy-dom (test env) does not implement BroadcastChannel.
// Returning null there makes the API a graceful no-op in tests.
let _channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (_channel !== undefined) return _channel;
  if (typeof BroadcastChannel === 'undefined') {
    _channel = null;
    return null;
  }
  _channel = new BroadcastChannel(CHANNEL_NAME);
  return _channel;
}

export function broadcastDocEvent(event: DocEvent) {
  getChannel()?.postMessage(event);
}

// Hook: subscribe to incoming events. The handler ref pattern keeps the listener
// stable across renders while still calling the latest handler closure.
export function useDocEvents(handler: (event: DocEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const channel = getChannel();
    if (!channel) return;
    const listener = (e: MessageEvent<DocEvent>) => handlerRef.current(e.data);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }, []);
}
