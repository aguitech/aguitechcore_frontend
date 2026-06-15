import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const STATUS_COLORS = { activo: '#22c55e', pausado: '#f59e0b', completado: '#6366f1' };

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

      <div className="kpis">
        <Kpi label="Total proyectos" value={stats.total} />
        <Kpi label="Activos" value={stats.activos} color="#22c55e" />
        <Kpi label="Completados" value={stats.completados} color="#6366f1" />
        <Kpi label="Progreso promedio" value={`${stats.promedio}%`} color="#f59e0b" />
      </div>

      <div className="card">
        <h3>Proyectos recientes</h3>
        {projects.length === 0 ? (
          <p className="muted">Sin proyectos aún.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Proyecto</th><th>Cliente</th><th>Estado</th><th>Progreso</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p._id}>
                  <td>{p.title}</td>
                  <td>{p.client}</td>
                  <td><span className="pill" style={{ background: STATUS_COLORS[p.status] }}>{p.status}</span></td>
                  <td>
                    <div className="bar"><div className="fill" style={{ width: `${p.progress}%` }} /></div>
                    <small>{p.progress}%</small>
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
