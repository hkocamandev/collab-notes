import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const WS_URL = import.meta.env.VITE_YWS_URL ?? 'ws://localhost:4001';

// Module-level cache: keyed by docId so React StrictMode's mount→unmount→remount
// cycle (dev only) reuses the same Yjs doc instead of creating a fresh one each time.
// Real unmount is detected via deferred destroy: if no remount cancels the timer
// within one macrotask, the entry is torn down for real.
type YjsEntry = {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  refs: number;
  destroyTimer: number | null;
};

const yjsCache = new Map<string, YjsEntry>();

export function acquireYjs(docId: string): YjsEntry {
  const existing = yjsCache.get(docId);
  if (existing) {
    if (existing.destroyTimer !== null) {
      clearTimeout(existing.destroyTimer);
      existing.destroyTimer = null;
    }
    existing.refs++;
    return existing;
  }
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(WS_URL, `doc-${docId}`, ydoc);
  const entry: YjsEntry = { ydoc, provider, refs: 1, destroyTimer: null };
  yjsCache.set(docId, entry);
  return entry;
}

export function releaseYjs(docId: string) {
  const entry = yjsCache.get(docId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  // Defer destroy to next macrotask so a StrictMode remount can reclaim it.
  entry.destroyTimer = window.setTimeout(() => {
    entry.provider.destroy();
    entry.ydoc.destroy();
    yjsCache.delete(docId);
  }, 0);
}

export const __resetYjsCacheForTests = () => {
  yjsCache.forEach(entry => {
    if (entry.destroyTimer !== null) clearTimeout(entry.destroyTimer);
  });
  yjsCache.clear();
};

// Broadcast a "you were revoked" signal over Yjs awareness. Awareness updates
// flow over both WebSocket (cross-user, cross-device) and BroadcastChannel
// (same-browser tabs) — the exact channels we need so a revoked editor finds
// out in real time. We piggyback on the local awareness state by appending
// the revoked user's id; receivers iterate awareness states and check if
// their own userId appears in any peer's revokedUserIds list.
export function signalRevoke(docId: string, revokedUserId: string) {
  const entry = yjsCache.get(docId);
  if (!entry) return;
  const local = entry.provider.awareness.getLocalState() as
    | { revokedUserIds?: string[] }
    | null;
  const current = local?.revokedUserIds ?? [];
  if (current.includes(revokedUserId)) return;
  entry.provider.awareness.setLocalStateField('revokedUserIds', [
    ...current,
    revokedUserId,
  ]);
}

// React hook: acquire on mount, release on unmount. Same docId across multiple
// callers (e.g., DocumentPage and CollabEditor) is safe — refcount handles it.
export function useYjsCache(docId: string): YjsEntry {
  const [entry] = useState(() => acquireYjs(docId));
  useEffect(() => {
    return () => releaseYjs(docId);
  }, [docId]);
  return entry;
}

// React hook: synced title backed by Y.Text in the same Yjs doc.
// Returns [title, setTitle, seedIfEmpty]:
//   - title: current value, updates on remote changes
//   - setTitle: write to Y.Text (will broadcast to other tabs)
//   - seedIfEmpty: call once after DB load — only writes if Y.Text is still empty
export function useCollabTitle(docId: string) {
  const { ydoc } = useYjsCache(docId);
  const ytext = useMemo(() => ydoc.getText('title'), [ydoc]);

  const [title, setTitleLocal] = useState(() => ytext.toString());

  useEffect(() => {
    const observer = () => setTitleLocal(ytext.toString());
    ytext.observe(observer);
    // Re-sync once on mount in case Y.Text was populated before observer attached
    setTitleLocal(ytext.toString());
    return () => ytext.unobserve(observer);
  }, [ytext]);

  const setTitle = useCallback(
    (newTitle: string) => {
      const current = ytext.toString();
      if (current === newTitle) return;
      ydoc.transact(() => {
        ytext.delete(0, current.length);
        ytext.insert(0, newTitle);
      });
    },
    [ydoc, ytext],
  );

  const seedIfEmpty = useCallback(
    (dbTitle: string) => {
      if (ytext.toString() !== '' || !dbTitle) return;
      ydoc.transact(() => {
        ytext.insert(0, dbTitle);
      });
    },
    [ydoc, ytext],
  );

  return [title, setTitle, seedIfEmpty] as const;
}
