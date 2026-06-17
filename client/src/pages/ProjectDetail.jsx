import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const PROJECT_STATUS = {
  activo: { label: 'Activo', color: '#22c55e' },
  pausado: { label: 'Pausado', color: '#f59e0b' },
  completado: { label: 'Completado', color: '#3b82f6' },
};

const PRIORITY_COLORS = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e' };
const STATUS_COLORS = { pendiente: '#94a3b8', en_curso: '#FF6A00', hecho: '#22c55e' };
const TASK_STATUS_LABELS = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho' };

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString('es-MX');
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('todas');

  async function load() {
    try {
      const { data } = await api.get(`/dashboard/projects/${id}/detail`);
      setData(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Layout><p className="center">Cargando proyecto…</p></Layout>;
  if (error) return <Layout><div className="alert">{error}<br /><Link to="/proyectos">← Volver a proyectos</Link></div></Layout>;
  if (!data) return null;

  const { project, stats, tasks, memberStats, recentComments } = data;
  const status = PROJECT_STATUS[project.status] || { label: project.status, color: '#666' };

  const filteredTasks = filter === 'todas' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <Layout>
      <header className="page-head">
        <div>
          <Link to="/proyectos" className="back-link">← Proyectos</Link>
          <h1 style={{ marginTop: 4 }}>{project.title}</h1>
          <p className="muted">
            {project.client ? <>👤 {project.client.name}{project.client.company ? ` · ${project.client.company}` : ''}</> : 'Sin cliente'}
            {project.startDate && <> · 📅 {fmtDate(project.startDate)} → {fmtDate(project.endDate)}</>}
          </p>
        </div>
        <span className="pill big" style={{ background: status.color }}>{status.label}</span>
      </header>

      {/* === Stats panel === */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Avance real</div>
          <div className="stat-value">
            {stats.weightedProgress}%
            {stats.weightedProgress !== stats.manualProgress && (
              <small className="muted"> · manual {stats.manualProgress}%</small>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${stats.weightedProgress}%` }} />
          </div>
          <div className="muted small">Calculado por status de tareas</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Tareas</div>
          <div className="stat-value">{stats.totalTasks}</div>
          <div className="status-row">
            <span className="dot" style={{ background: STATUS_COLORS.pendiente }} />{stats.byStatus.pendiente} pendiente
            <span className="dot" style={{ background: STATUS_COLORS.en_curso, marginLeft: 10 }} />{stats.byStatus.en_curso} en curso
            <span className="dot" style={{ background: STATUS_COLORS.hecho, marginLeft: 10 }} />{stats.byStatus.hecho} hechas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Prioridad</div>
          <div className="stat-value">{stats.totalTasks}</div>
          <div className="status-row">
            <span className="dot" style={{ background: PRIORITY_COLORS.alta }} />{stats.byPriority.alta} alta
            <span className="dot" style={{ background: PRIORITY_COLORS.media, marginLeft: 10 }} />{stats.byPriority.media} media
            <span className="dot" style={{ background: PRIORITY_COLORS.baja, marginLeft: 10 }} />{stats.byPriority.baja} baja
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Fechas</div>
          <div className="stat-value">
            {stats.overdue > 0
              ? <span style={{ color: '#ef4444' }}>{stats.overdue} vencida{stats.overdue !== 1 ? 's' : ''}</span>
              : <span style={{ color: '#22c55e' }}>Al día</span>}
          </div>
          {stats.nextDeadline && (
            <div className="muted small">📅 Próx: {stats.nextDeadline.title}<br />{fmtDate(stats.nextDeadline.dueDate)}</div>
          )}
          {!stats.nextDeadline && stats.totalTasks > 0 && <div className="muted small">Sin pendientes próximos</div>}
        </div>
      </div>

      <div className="detail-grid">
        {/* === Tasks === */}
        <div className="card">
          <header className="card-head">
            <h2>📋 Tareas del proyecto</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-sm">
              <option value="todas">Todas ({tasks.length})</option>
              <option value="pendiente">Pendientes ({stats.byStatus.pendiente})</option>
              <option value="en_curso">En curso ({stats.byStatus.en_curso})</option>
              <option value="hecho">Hechas ({stats.byStatus.hecho})</option>
            </select>
          </header>

          {filteredTasks.length === 0 ? (
            <p className="muted">No hay tareas en este filtro.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Status</th>
                  <th>Prioridad</th>
                  <th>Fecha</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t) => {
                  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'hecho';
                  return (
                    <tr key={t._id}>
                      <td>
                        <Link to={`/tasks?task=${t._id}`}>
                          <strong>{t.title}</strong>
                        </Link>
                        {t.description && <div className="muted small">{t.description.slice(0, 60)}{t.description.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td>
                        <span className="pill small" style={{ background: STATUS_COLORS[t.status] }}>
                          {TASK_STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td>
                        <span className="pill small" style={{ background: PRIORITY_COLORS[t.priority] }}>
                          {t.priority}
                        </span>
                      </td>
                      <td>
                        {t.dueDate
                          ? <span style={{ color: isOverdue ? '#ef4444' : 'inherit' }}>{fmtDate(t.dueDate)}{isOverdue && ' ⚠'}</span>
                          : '—'}
                      </td>
                      <td className="muted small">{t.owner?.name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* === Right column: team + activity === */}
        <div className="side-col">
          {/* Members */}
          <div className="card">
            <h2>👥 Equipo ({memberStats.length})</h2>
            {memberStats.length === 0 ? (
              <p className="muted small">Sin miembros asignados</p>
            ) : (
              <div className="members-list-compact">
                {memberStats.map((m) => {
                  const initials = m.user?.name?.[0]?.toUpperCase() || '?';
                  return (
                    <div key={m.user._id} className="member-row">
                      <div className="member-avatar-sm">{initials}</div>
                      <div className="member-info-sm">
                        <strong>{m.user.name}</strong>
                        <div className="muted small">
                          {m.role} · {m.tasksOwned} tarea{m.tasksOwned !== 1 ? 's' : ''}
                          {m.tasksCompleted > 0 && ` (${m.tasksCompleted} ✓)`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="card">
            <h2>💬 Actividad reciente</h2>
            {recentComments.length === 0 ? (
              <p className="muted small">Sin comentarios aún</p>
            ) : (
              <div className="activity-list">
                {recentComments.map((c) => (
                  <div key={c._id} className="activity-item">
                    <div className="activity-head">
                      <strong>{c.author?.name || '—'}</strong>
                      <span className="muted small">comentó · {timeAgo(c.createdAt)}</span>
                    </div>
                    <div className="muted small">en <em>{c.taskTitle}</em></div>
                    <p className="activity-text">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
