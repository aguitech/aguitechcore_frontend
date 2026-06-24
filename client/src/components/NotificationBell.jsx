import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';

const TYPE_META = {
  'chat.message':         { icon: '💬', color: '#3b82f6' },
  'chat.mention':         { icon: '📣', color: '#8b5cf6' },
  'task.assigned':        { icon: '✅', color: '#10b981' },
  'task.status_changed':  { icon: '🔄', color: '#f59e0b' },
  'task.commented':       { icon: '💬', color: '#10b981' },
  'blog.comment':         { icon: '💬', color: '#FF6A00' },
  'blog.published':       { icon: '📰', color: '#FF6A00' },
  'appointment.created':  { icon: '📅', color: '#0ea5e9' },
  'appointment.cancelled':{ icon: '❌', color: '#ef4444' },
  'appointment.reminder': { icon: '⏰', color: '#0ea5e9' },
  'user.role_changed':    { icon: '🛡️', color: '#a855f7' },
  'system':               { icon: '⚙️', color: '#6b7280' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/notifications', { params: { limit: 30 } });
      setItems(r.data.items || []);
      setUnread(r.data.unread || 0);
    } catch (err) {
      // Fail silently — the bell is a non-critical feature
      console.warn('[bell] load failed:', err?.response?.data?.msg || err.message);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + 30s polling
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function markAllRead() {
    try {
      await api.post('/notifications/mark-read', { all: true });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (err) {
      console.warn('[bell] mark-all failed:', err?.response?.data?.msg || err.message);
    }
  }

  async function markRead(id) {
    try {
      await api.post('/notifications/mark-read', { ids: [id] });
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      console.warn('[bell] mark-read failed:', err?.response?.data?.msg || err.message);
    }
  }

  async function clearAll() {
    if (!confirm('¿Borrar todas las notificaciones?')) return;
    try {
      await api.post('/notifications/clear-all');
      setItems([]);
      setUnread(0);
    } catch (err) {
      console.warn('[bell] clear-all failed:', err?.response?.data?.msg || err.message);
    }
  }

  async function deleteOne(id) {
    try {
      await api.delete(`/notifications/${id}`);
      setItems((prev) => prev.filter((n) => n._id !== id));
    } catch (err) {
      console.warn('[bell] delete failed:', err?.response?.data?.msg || err.message);
    }
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className={`bell-button ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        title={`${unread} sin leer`}
      >
        <span className="bell-icon">🔔</span>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-head">
            <strong>Notificaciones</strong>
            <div className="notif-head-actions">
              {unread > 0 && (
                <button type="button" className="link" onClick={markAllRead}>
                  ✓ Marcar leídas
                </button>
              )}
              {items.length > 0 && (
                <button type="button" className="link danger" onClick={clearAll}>
                  🗑 Borrar todo
                </button>
              )}
            </div>
          </div>

          <div className="notif-list">
            {loading && items.length === 0 && (
              <div className="notif-empty">
                <span className="muted">Cargando…</span>
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="notif-empty">
                <span style={{ fontSize: 40 }}>🔕</span>
                <p className="muted">Sin notificaciones</p>
                <p className="muted small">Te avisaremos cuando llegue algo nuevo</p>
              </div>
            )}
            {items.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.system;
              const content = (
                <div className={`notif-item ${n.read ? '' : 'unread'}`}>
                  <div className="notif-icon" style={{ background: meta.color + '22', color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-text">{n.body}</div>}
                    <div className="notif-meta">
                      <span>{timeAgo(n.createdAt)}</span>
                      {n.actorName && <span> · {n.actorName}</span>}
                    </div>
                  </div>
                  <div className="notif-actions">
                    {!n.read && (
                      <button
                        type="button"
                        className="notif-action"
                        title="Marcar leída"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n._id); }}
                      >
                        ✓
                      </button>
                    )}
                    <button
                      type="button"
                      className="notif-action danger"
                      title="Borrar"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(n._id); }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n._id} to={n.link} onClick={() => { markRead(n._id); setOpen(false); }}>
                  {content}
                </Link>
              ) : (
                <div key={n._id}>{content}</div>
              );
            })}
          </div>

          <div className="notif-foot">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              Ver todas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
