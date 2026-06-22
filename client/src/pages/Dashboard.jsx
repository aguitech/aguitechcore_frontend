import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const STATUS_COLORS = { activo: '#22c55e', pausado: '#f59e0b', completado: '#6366f1' };
const STATUS_LABELS = { activo: 'Activo', pausado: 'Pausado', completado: 'Completado' };

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, activos: 0, completados: 0, promedio: 0 });
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get('/dashboard/stats').then((r) => setStats(r.data)).catch(console.error);
    api.get('/dashboard/projects').then((r) => setProjects(r.data)).catch(console.error);
  }, []);

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Resumen general de tus proyectos y KPIs</p>
        </div>
      </header>

      <div className="blog-cta">
        <div>
          <h3>📰 Blog público</h3>
          <p className="muted">
            Crea publicaciones con imágenes, videos, documentos y notas. Todo lo que publiques aquí
            aparece automáticamente en el sitio web público.
          </p>
        </div>
        <div className="blog-cta-actions">
          <Link to="/blog" className="btn primary">Administrar blog</Link>
          <a href="/public/blog" target="_blank" rel="noreferrer" className="btn ghost">
            Ver sitio público ↗
          </a>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Total proyectos" value={stats.total} />
        <Kpi label="Activos" value={stats.activos} color="#22c55e" />
        <Kpi label="Completados" value={stats.completados} color="#6366f1" />
        <Kpi label="Progreso promedio" value={`${stats.promedio}%`} color="#f59e0b" />
      </div>

      <div className="card">
        <header className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <h3 style={{ margin: 0 }}>Proyectos recientes</h3>
          <Link to="/proyectos" className="ghost small" style={{ textDecoration: 'none' }}>Ver todos →</Link>
        </header>
        {projects.length === 0 ? (
          <p className="muted">Sin proyectos aún. Crea el primero en la sección <strong>Proyectos</strong>.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Proyecto</th><th>Cliente</th><th>Estado</th><th>Progreso</th><th>Equipo</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p._id}>
                  <td>
                    <Link to={`/proyectos/${p._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <strong style={{ color: 'var(--accent)' }}>{p.title}</strong>
                    </Link>
                  </td>
                  <td>
                    {p.client ? (
                      <>
                        <strong>{p.client.name}</strong>
                        {p.client.company && <div className="muted small">{p.client.company}</div>}
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>
                    <span className="pill" style={{ background: STATUS_COLORS[p.status] || '#666' }}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td>
                    <div className="bar">
                      <div className="fill" style={{ width: `${p.progress ?? 0}%` }} />
                    </div>
                    <small>{p.progress ?? 0}%</small>
                  </td>
                  <td>
                    {p.members?.length > 0 ? (
                      <div className="avatar-group">
                        {p.members.slice(0, 3).map((m) => (
                          <div key={m.user._id} className="avatar-sm" title={m.user.name}>
                            {m.user.name?.[0]?.toUpperCase() || '?'}
                          </div>
                        ))}
                        {p.members.length > 3 && (
                          <div className="avatar-sm avatar-more">+{p.members.length - 3}</div>
                        )}
                      </div>
                    ) : <span className="muted small">Sin equipo</span>}
                  </td>
                  <td>
                    <Link to={`/proyectos/${p._id}`} className="ghost small" style={{ textDecoration: 'none' }} title="Ver detalle del proyecto">
                      📊 Detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="kpi" style={{ borderTop: `3px solid ${color || '#FF6A00'}` }}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
