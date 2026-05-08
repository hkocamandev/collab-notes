import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ping() {
    setLoading(true);
    try {
      const res = await fetch('/api/ping');
      const data = (await res.json()) as { message: string; time: string };
      setPingResult(`${data.message}  ·  ${new Date(data.time).toLocaleTimeString()}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-mark" />
          <span>Collab Notes</span>
        </div>
        <div className="dashboard-user">
          <span className="muted">{user?.name ?? user?.email}</span>
          <button onClick={logout} className="btn-secondary">
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="card">
          <h2>Welcome{user?.name ? `, ${user.name}` : ''}!</h2>
          <p className="muted">
            Your workspace is ready. Documents, the block editor, and real-time
            sync land in the next branches.
          </p>
          <div className="row">
            <button onClick={ping} disabled={loading} className="btn-primary">
              {loading ? 'Pinging…' : 'Ping server'}
            </button>
            {pingResult && <pre className="result">{pingResult}</pre>}
          </div>
        </div>
      </main>
    </div>
  );
}
