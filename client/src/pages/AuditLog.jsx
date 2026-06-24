import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const CATEGORIES = [
  { value: '', label: 'Todas las categorías' },
  { value: 'auth', label: '🔐 Autenticación' },
  { value: 'user', label: '👤 Usuarios' },
  { value: 'client', label: '👥 Clientes' },
  { value: 'project', label: '📁 Proyectos' },
  { value: 'task', label: '✅ Tareas' },
  { value: 'blog', label: '📰 Blog' },
  { value: 'chat', label: '💬 Chat' },
  { value: 'apikey', label: '🔑 API Keys' },
  { value: 'file', label: '📎 Archivos' },
  { value: 'appointment', label: '📅 Citas' },
  { value: 'admin', label: '🛡️ Admin' },
  { value: 'system', label: '⚙️ Sistema' },
];

const SEVERITY_META = {
  info:     { color: '#0ea5e9', icon: 'ℹ️' },
  warning:  { color: '#f59e0b', icon: '⚠️' },
  critical: { color: '#ef4444', icon: '🚨' },
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditLog() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ byCategory: [], bySeverity: [], byDay: [] });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    severity: '',
    action: '',
    actor: '',
    q: '',
    from: '',
    to: '',
  });
  const [skip, setSkip] = useState(0);
  const limit = 100;

  async function load() {
    setLoading(true);
    try {
      const params = { limit, skip };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await api.get('/audit-log', { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setStats(r.data.stats || { byCategory: [], bySeverity: [], byDay: [] });
    } catch (err) {
      if (err?.response?.status === 403) {
        alert('Solo administradores pueden ver la bitácora');
      } else {
        console.warn(err);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [skip]);

  function applyFilters() {
    setSkip(0);
    load();
  }

  function clearFilters() {
    setFilters({ category: '', severity: '', action: '', actor: '', q: '', from: '', to: '' });
    setSkip(0);
    setTimeout(load, 0);
  }

  function exportCSV() {
    // Use the same token in a hidden iframe / window navigation so the browser
    // does the download with the right auth header.
    const token = localStorage.getItem('token');
    if (!token) return;
    const url = `/api/audit-log/export?limit=5000`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>📋 Bitácora de auditoría</h1>
            <p className="muted">
              {total} eventos registrados · retención 180 días
            </p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={load} disabled={loading}>
              🔄 Refrescar
            </button>
            <button className="btn primary" onClick={exportCSV} disabled={total === 0}>
              ⬇️ Exportar CSV
            </button>
          </div>
        </div>

        {/* stats tiles */}
        <div className="stats-tiles">
          <div className="stat-tile">
            <span className="stat-label">Total eventos</span>
            <strong className="stat-value">{total}</strong>
          </div>
          {stats.bySeverity.map((s) => {
            const meta = SEVERITY_META[s._id] || { color: '#888', icon: 'ℹ️' };
            return (
              <div key={s._id} className="stat-tile" style={{ borderLeft: `4px solid ${meta.color}` }}>
                <span className="stat-label">{meta.icon} {s._id}</span>
                <strong className="stat-value">{s.count}</strong>
              </div>
            );
          })}
        </div>

        {/* category breakdown */}
        {stats.byCategory.length > 0 && (
          <div className="category-bar">
            {stats.byCategory.slice(0, 8).map((c) => {
              const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
              return (
                <div key={c._id} className="cat-bar-item" title={`${c._id}: ${c.count}`}>
                  <span className="cat-bar-label">{c._id}</span>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="cat-bar-count">{c.count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* filters */}
        <div className="filters audit-filters">
          <input
            type="text"
            className="input"
            placeholder="🔍 Buscar por usuario, título o acción…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
          <select
            className="input"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            className="input"
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">Todas las severidades</option>
            <option value="info">ℹ️ Info</option>
            <option value="warning">⚠️ Warning</option>
            <option value="critical">🚨 Crítico</option>
          </select>
          <input
            type="text"
            className="input"
            placeholder="Acción (ej. task.create)"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          />
          <input
            type="date"
            className="input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            title="Desde"
          />
          <input
            type="date"
            className="input"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            title="Hasta"
          />
          <button className="btn primary" onClick={applyFilters}>Filtrar</button>
          <button className="btn ghost" onClick={clearFilters}>✕ Limpiar</button>
        </div>

        {/* log table */}
        {loading && <div className="muted center pad">⏳ Cargando bitácora…</div>}
        {!loading && items.length === 0 && (
          <div className="empty">
            <span style={{ fontSize: 60 }}>📋</span>
            <h3>Sin eventos</h3>
            <p className="muted">Ajusta los filtros o espera a que ocurran acciones en el sistema.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Categoría</th>
                  <th>Objetivo</th>
                  <th>Severidad</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const sev = SEVERITY_META[it.severity] || SEVERITY_META.info;
                  return (
                    <tr key={it._id}>
                      <td className="audit-time">{fmtDate(it.createdAt)}</td>
                      <td>
                        <div className="audit-user">
                          <div className="audit-avatar">{it.actorName?.[0]?.toUpperCase() || '?'}</div>
                          <div>
                            <strong>{it.actorName}</strong>
                            <span className="muted small">{it.actorRole}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code className="audit-action">{it.action}</code>
                      </td>
                      <td>
                        <span className="tag">{it.category}</span>
                      </td>
                      <td>
                        <div>
                          {it.targetType && <span className="muted small">{it.targetType}</span>}
                          <div>{it.targetLabel || <span className="muted small">—</span>}</div>
                        </div>
                      </td>
                      <td>
                        <span className="severity-pill" style={{ background: sev.color + '22', color: sev.color }}>
                          {sev.icon} {it.severity}
                        </span>
                      </td>
                      <td className="audit-ip muted small">{it.ip || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {total > limit && (
          <div className="pagination">
            <button
              className="btn ghost"
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              disabled={skip === 0}
            >
              ← Anterior
            </button>
            <span className="muted">
              {skip + 1}–{Math.min(skip + limit, total)} de {total}
            </span>
            <button
              className="btn ghost"
              onClick={() => setSkip((s) => s + limit)}
              disabled={skip + limit >= total}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
