// Sidebar-bottom Ask AI panel.
//
// Posts the query to /api/ai/ask and renders the ranked title list. The
// embedding work happens on the server (transformers.js + the bundled
// all-MiniLM-L6-v2 model); the browser does no heavy lifting. Click a
// result to navigate to that document.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AskResult, askAi } from '../ai/api.js';

// Sidebar-bottom panel that semantically searches the user's documents.
// All AI work happens server-side (transformers.js + all-MiniLM-L6-v2),
// so the browser just shows results — no model download here.
export default function AskAi() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AskResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setSubmitted(true);
    try {
      const res = await askAi(q, 5);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ask-ai">
      <p className="sidebar-section-label">Ask AI</p>
      <form onSubmit={handleSubmit} className="ask-ai-form">
        <textarea
          className="ask-ai-input"
          rows={2}
          placeholder="Find docs about..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Ask AI query"
        />
        <button
          type="submit"
          className="btn-secondary ask-ai-submit"
          disabled={loading || !query.trim()}
        >
          {loading ? 'Searching…' : 'Ask'}
        </button>
      </form>

      {error && <p className="ask-ai-error">{error}</p>}

      {!loading && submitted && !error && results.length === 0 && (
        <p className="ask-ai-empty">No matching documents.</p>
      )}

      {results.length > 0 && (
        <ul className="ask-ai-results" aria-label="Search results">
          {results.map(r => (
            <li key={r.id}>
              <button
                className="ask-ai-result"
                onClick={() => navigate(`/documents/${r.id}`)}
                title={`Similarity: ${r.similarity.toFixed(2)}`}
              >
                {r.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
