import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const TYPE_META = {
  'chat.message':         { icon: '💬', color: '#3b82f6', label: 'Chat' },
  'chat.mention':         { icon: '📣', color: '#8b5cf6', label: 'Mención' },
  'task.assigned':        { icon: '✅', color: '#10b981', label: 'Tarea' },
  'task.status_changed':  { icon: '🔄', color: '#f59e0b', label: 'Tarea' },
  'task.commented':       { icon: '💬', color: '#10b981', label: 'Tarea' },
  'blog.comment':         { icon: '💬', color: '#FF6A00', label: 'Blog' },
  'blog.published':       { icon: '📰', color: '#FF6A00', label: 'Blog' },
  'appointment.created':  { icon: '📅', color: '#0ea5e9', label: 'Cita' },
  'appointment.cancelled':{ icon: '❌', color: '#ef4444', label: 'Cita' },
  'appointment.reminder': { icon: '⏰', color: '#0ea5e9', label: 'Cita' },
  'user.role_changed':    { icon: '🛡️', color: '#a855f7', label: 'Sistema' },
  'system':               { icon: '⚙️', color: '#6b7280', label: 'Sistema' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/notifications', { params: { limit: 200, unreadOnly: filter === 'unread' } });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setUnread(r.data.unread || 0);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  async function markAllRead() {
    setBusy(true);
    try {
      await api.post('/notifications/mark-read', { all: true });
      await load();
    } finally { setBusy(false); }
  }

  async function clearAll() {
    if (!confirm('¿Borrar todas las notificaciones?')) return;
    setBusy(true);
    try {
      await api.post('/notifications/clear-all');
      await load();
    } finally { setBusy(false); }
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>🔔 Notificaciones</h1>
            <p className="muted">
              {total} en total · {unread} sin leer
            </p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={markAllRead} disabled={busy || unread === 0}>
              ✓ Marcar todas leídas
            </button>
            <button className="btn danger" onClick={clearAll} disabled={busy || items.length === 0}>
              🗑 Borrar todo
            </button>
          </div>
        </div>

        <div className="filters">
          <button
            className={`btn small ${filter === 'all' ? 'primary' : 'ghost'}`}
            onClick={() => setFilter('all')}
          >
            Todas ({total})
          </button>
          <button
            className={`btn small ${filter === 'unread' ? 'primary' : 'ghost'}`}
            onClick={() => setFilter('unread')}
          >
            Sin leer ({unread})
          </button>
        </div>

        {loading && <div className="muted center pad">⏳ Cargando…</div>}
        {!loading && items.length === 0 && (
          <div className="empty">
            <span style={{ fontSize: 60 }}>🔕</span>
            <h3>Sin notificaciones</h3>
            <p className="muted">
              {filter === 'unread'
                ? 'No tienes notificaciones sin leer. ¡Todo al día!'
                : 'Cuando recibas mensajes, tareas asignadas o nuevas citas, aparecerán aquí.'}
            </p>
          </div>
        )}

        <div className="notif-list-page">
          {items.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.system;
            return (
              <div key={n._id} className={`notif-row ${n.read ? '' : 'unread'}`}>
                <div className="notif-icon" style={{ background: meta.color + '22', color: meta.color }}>
                  {meta.icon}
                </div>
                <div className="notif-row-body">
                  <div className="notif-row-head">
                    <strong>{n.title}</strong>
                    <span className="muted small">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <p>{n.body}</p>}
                  <div className="notif-row-foot">
                    <span className="tag" style={{ background: meta.color + '22', color: meta.color }}>
                      {meta.label}
                    </span>
                    {n.actorName && <span className="muted small">de {n.actorName}</span>}
                    {n.link && (
                      <a className="link small" href={n.link} onClick={(e) => {
                        // Soft-pretend it's a React Router link without depending on useNavigate
                        e.preventDefault();
                        window.history.pushState({}, '', n.link);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}>
                        Abrir →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
