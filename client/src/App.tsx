import { useState } from 'react';

type PingResponse = { message: string; time: string };

export default function App() {
  const [response, setResponse] = useState<PingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ping() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ping');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PingResponse;
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Collab Notes</h1>
      <p className="subtitle">Real-time collaborative note-taking — skeleton.</p>
      <button onClick={ping} disabled={loading}>
        {loading ? 'Pinging…' : 'Ping server'}
      </button>
      {response && (
        <pre className="result">
          {response.message} <span className="muted">({response.time})</span>
        </pre>
      )}
      {error && <p className="error">Error: {error}</p>}
    </main>
  );
}
