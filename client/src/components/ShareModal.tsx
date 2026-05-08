// Owner-only share management dialog.
//
// On mount it fetches the current shares and re-fetches after every
// add/revoke so the list always reflects the server (no stale optimistic
// state). Three side effects worth flagging when a share is added or
// revoked:
//   - signalRevoke: writes a revokedUserIds field to Yjs awareness so any
//     active editor session for the revoked user is kicked out instantly.
//   - broadcastDocEvent (share-added): tells the recipient's same-browser
//     tabs to refetch their sidebar AND drives a toast notification.
//   - onSharesChanged: lets the parent (DocumentPage) update the
//     share-count badge without re-querying the server.

import { useEffect, useState } from 'react';
import { type Share, listShares, shareDocument, revokeShare } from '../documents/api.js';
import { ApiError } from '../lib/apiClient.js';
import { signalRevoke } from '../lib/yjsCache.js';
import { broadcastDocEvent } from '../lib/docEvents.js';
import { useAuth } from '../auth/AuthContext.js';

interface ShareModalProps {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
  // Called with the new share count whenever the list changes (after add/revoke
  // or initial load). Lets the parent keep its share-count badge in sync.
  onSharesChanged?: (count: number) => void;
  // Called when the owner clicks the "Editor" pill on a share row — closes the
  // modal and jumps the cursor to the end of the document.
  onJumpToEnd?: () => void;
}

export default function ShareModal({
  documentId,
  documentTitle,
  onClose,
  onSharesChanged,
  onJumpToEnd,
}: ShareModalProps) {
  const { user } = useAuth();
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listShares(documentId);
      setShares(res.shares);
      onSharesChanged?.(res.shares.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load existing shares');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await shareDocument(documentId, email.trim());
      setEmail('');
      // Notify the recipient's open tabs (same browser) so their sidebar refetches
      // immediately and a toast pops up. Cross-browser users still need a refresh
      // — that path would need a server-side push, which we don't have yet.
      broadcastDocEvent({
        type: 'share-added',
        forUserId: res.share.userId,
        senderName: user?.name ?? null,
        senderEmail: user?.email,
        docTitle: documentTitle,
      });
      // Re-fetch from server instead of optimistic append, so the list always
      // reflects what's actually persisted. load() also fires onSharesChanged.
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setError('No user with that email is registered.');
        else if (err.status === 409) setError('This document is already shared with that user.');
        else if (err.status === 400) setError('Invalid email or you cannot share with yourself.');
        else if (
          err.status === 403 &&
          typeof err.body === 'object' &&
          err.body !== null &&
          'kind' in err.body &&
          (err.body as { kind?: string }).kind === 'share-limit'
        ) {
          setError('Basic plan allows only 1 share per document. Upgrade to Premium for unlimited shares.');
        } else setError(err.message || 'Could not share document.');
      } else {
        setError('Could not share document.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(userId: string) {
    setError(null);
    try {
      await revokeShare(documentId, userId);
      // Notify the revoked user's open tabs in real time via Yjs awareness.
      // Their CollabEditor sees the revokedUserIds signal and navigates away.
      signalRevoke(documentId, userId);
      // Re-fetch so the list is authoritative (no stale optimistic state).
      // load() fires onSharesChanged with the new count.
      await load();
    } catch {
      setError('Could not revoke share. Please try again.');
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
        <div className="modal-header">
          <h2 id="share-modal-title" className="modal-title">
            Share &ldquo;{documentTitle || 'Untitled'}&rdquo;
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit} className="share-form">
          <input
            type="email"
            className="share-email-input"
            placeholder="Enter email to invite an editor"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={submitting}
            aria-label="Email to share with"
          />
          <button type="submit" className="btn-primary" disabled={submitting || !email.trim()}>
            {submitting ? 'Sharing…' : 'Share'}
          </button>
        </form>

        {error && <p className="share-error">{error}</p>}

        <div className="share-list">
          <div className="share-list-header">
            <p className="share-list-label">
              People with access
              {!loading && shares.length > 0 && ` (${shares.length})`}
            </p>
            <button
              className="btn-link share-list-refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh shares list"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          {loading && <p className="muted share-list-empty">Loading…</p>}
          {!loading && loadError && <p className="share-error">{loadError}</p>}
          {!loading && !loadError && shares.length === 0 && (
            <p className="muted share-list-empty">
              Only you have access. Share via the form above.
            </p>
          )}
          {!loading && shares.map(s => (
            <div key={s.id} className="share-row">
              <div className="share-row-info">
                <span className="share-row-name">{s.userName ?? s.userEmail}</span>
                {s.userName && <span className="share-row-email">{s.userEmail}</span>}
                <button
                  type="button"
                  className="share-row-permission"
                  onClick={() => {
                    onJumpToEnd?.();
                    onClose();
                  }}
                  aria-label="Jump to end of document"
                  title="Jump to end of document"
                >
                  Editor
                </button>
              </div>
              <button
                className="btn-secondary btn-danger"
                onClick={() => void handleRevoke(s.userId)}
                aria-label={`Revoke access for ${s.userEmail}`}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
