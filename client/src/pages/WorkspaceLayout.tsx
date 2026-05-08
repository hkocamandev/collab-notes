import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { Sidebar } from '../components/Sidebar.js';
import {
  type Document,
  createDocument,
  deleteDocument,
  listDocuments,
  listTrash,
  restoreDocument,
} from '../documents/api.js';

export interface WorkspaceOutletContext {
  onDelete: (id: string) => Promise<void>;
}

export default function WorkspaceLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [trashDocs, setTrashDocs] = useState<Document[]>([]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    const [active, trash] = await Promise.all([listDocuments(), listTrash()]);
    setDocuments(active.documents);
    setTrashDocs(trash.documents);
  }

  async function handleCreate() {
    const res = await createDocument();
    setDocuments(prev => [res.document, ...prev]);
    navigate(`/documents/${res.document.id}`);
  }

  async function handleDelete(id: string) {
    const doc = documents.find(d => d.id === id);
    await deleteDocument(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (doc) {
      setTrashDocs(prev => [{ ...doc, deletedAt: new Date().toISOString() }, ...prev]);
    }
    navigate('/');
  }

  async function handleRestore(id: string) {
    const res = await restoreDocument(id);
    setTrashDocs(prev => prev.filter(d => d.id !== id));
    setDocuments(prev => [res.document, ...prev]);
    navigate(`/documents/${res.document.id}`);
  }

  return (
    <div className="workspace">
      <Sidebar
        documents={documents}
        trashDocs={trashDocs}
        onCreateDocument={() => void handleCreate()}
        onDeleteDocument={id => void handleDelete(id)}
        onRestoreDocument={id => void handleRestore(id)}
      />
      <div className="workspace-content">
        <header className="workspace-header">
          <div />
          <div className="dashboard-user">
            <span className="muted">{user?.name ?? user?.email}</span>
            <button onClick={logout} className="btn-secondary">
              Logout
            </button>
          </div>
        </header>
        <main className="workspace-main">
          <Outlet context={{ onDelete: handleDelete } satisfies WorkspaceOutletContext} />
        </main>
      </div>
    </div>
  );
}
