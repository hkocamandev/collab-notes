import { useEffect, useState } from 'react';
import { type Version, listVersions } from '../documents/api.js';

interface VersionHistoryModalProps {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

// Format a timestamp as a short relative + absolute label, e.g. "2 hours ago
// (May 9, 14:32)". Falls back to absolute alone if `Date` parsing fails.
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const absolute = d.toLocaleString();

  if (diffMin < 1) return `Just now (${absolute})`;
  if (diffMin < 60) return `${diffMin} min ago (${absolute})`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago (${absolute})`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago (${absolute})`;
  return absolute;
}

export default function VersionHistoryModal({
  documentId,
  documentTitle,
  onClose,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listVersions(documentId);
      setVersions(res.versions);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load version history');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="versions-modal-title">
        <div className="modal-header">
          <h2 id="versions-modal-title" className="modal-title">
            Version history — &ldquo;{documentTitle || 'Untitled'}&rdquo;
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="share-list">
          <div className="share-list-header">
            <p className="share-list-label">
              Snapshots{!loading && versions.length > 0 && ` (${versions.length})`}
            </p>
            <button
              className="btn-link share-list-refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh version list"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          {loading && <p className="muted share-list-empty">Loading…</p>}
          {!loading && loadError && <p className="share-error">{loadError}</p>}
          {!loading && !loadError && versions.length === 0 && (
            <p className="muted share-list-empty">
              No versions yet. A snapshot is created when an editor logs out.
            </p>
          )}
          {!loading && versions.map(v => (
            <div key={v.id} className="share-row version-row">
              <div className="share-row-info">
                <span className="share-row-name">
                  {v.editedBy.name ?? v.editedBy.email}
                </span>
                {v.editedBy.name && (
                  <span className="share-row-email">{v.editedBy.email}</span>
                )}
                <span className="version-row-time">{formatTimestamp(v.editedAt)}</span>
              </div>
              <button
                className="btn-secondary"
                disabled
                title="Restore — coming soon"
                aria-label="Restore this version (coming soon)"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
