// Lightweight toast notification system. WorkspaceLayout owns the state and
// auto-removes each toast 10 seconds after it pushes. The CSS animation
// handles the fade-in/fade-out so the unmount is just removal from the list
// — clean separation between lifecycle and visual transition.

export interface ToastItem {
  id: string;
  title: string;
  body?: string;
}

interface ToastListProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastList({ toasts, onDismiss }: ToastListProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-list" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="toast">
          <div className="toast-content">
            <p className="toast-title">{toast.title}</p>
            {toast.body && <p className="toast-body">{toast.body}</p>}
          </div>
          <button
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
