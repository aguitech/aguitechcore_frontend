import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const EMPTY = {
  title: '',
  client: '',
  status: 'activo',
  progress: 0,
  description: '',
  budget: '',
  startDate: '',
  endDate: '',
};

const STATUS = {
  activo: { label: 'Activo', color: '#22c55e' },
  pausado: { label: 'Pausado', color: '#f59e0b' },
  completado: { label: 'Completado', color: '#3b82f6' },
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('todos');

  async function load() {
    const { data } = await api.get('/dashboard/projects');
    setProjects(data);
  }
  useEffect(() => { load(); }, []);

  function open(project = null) {
    setEditing(project ? project._id : 'new');
    setForm(project
      ? {
          title: project.title || '',
          client: project.client || '',
          status: project.status || 'activo',
          progress: project.progress ?? 0,
          description: project.description || '',
          budget: project.budget ?? '',
          startDate: project.startDate ? project.startDate.substring(0, 10) : '',
          endDate: project.endDate ? project.endDate.substring(0, 10) : '',
        }
      : EMPTY
    );
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      if (payload.budget === '') delete payload.budget;
      else payload.budget = Number(payload.budget);
      if (editing === 'new') await api.post('/dashboard/projects', payload);
      else await api.put(`/dashboard/projects/${editing}`, payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar proyecto?')) return;
    await api.delete(`/dashboard/projects/${id}`);
    load();
  }

  const filtered = filter === 'todos' ? projects : projects.filter(p => p.status === filter);

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Proyectos</h1>
          <p className="muted">{projects.length} proyectos · {filtered.length} visibles</p>
        </div>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-sm">
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="pausado">Pausados</option>
            <option value="completado">Completados</option>
          </select>
          <button onClick={() => open()} className="primary">+ Nuevo proyecto</button>
        </div>
      </header>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nuevo proyecto' : 'Editar proyecto'}</h3>
            {error && <div className="alert">{error}</div>}
            <div className="grid-2">
              <Field label="Título *" v={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
              <Field label="Cliente *" v={form.client} onChange={(v) => setForm({ ...form, client: v })} required />
            </div>
            <div className="grid-2">
              <label>Estado
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                </select>
              </label>
              <Field
                label="Avance (%)"
                v={form.progress}
                type="number"
                onChange={(v) => setForm({ ...form, progress: Math.max(0, Math.min(100, Number(v) || 0)) })}
              />
            </div>
            <div className="grid-2">
              <Field label="Presupuesto (MXN)" v={form.budget} type="number" onChange={(v) => setForm({ ...form, budget: v })} />
              <div></div>
              <Field label="Fecha inicio" v={form.startDate} type="date" onChange={(v) => setForm({ ...form, startDate: v })} />
              <Field label="Fecha fin" v={form.endDate} type="date" onChange={(v) => setForm({ ...form, endDate: v })} />
            </div>
            <Field label="Descripción" v={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <p className="muted">Sin proyectos{filter !== 'todos' ? ` en estado "${filter}"` : ''}. Crea el primero con "+ Nuevo proyecto".</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Avance</th>
                <th>Presupuesto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p._id}>
                  <td>
                    <strong>{p.title || '(sin título)'}</strong>
                    {p.description && <div className="muted small">{p.description.substring(0, 60)}{p.description.length > 60 ? '…' : ''}</div>}
                  </td>
                  <td>{p.client || '—'}</td>
                  <td>
                    <span className="pill" style={{ background: STATUS[p.status]?.color || '#666' }}>
                      {STATUS[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${p.progress ?? 0}%` }} />
                      <span className="progress-text">{p.progress ?? 0}%</span>
                    </div>
                  </td>
                  <td>{p.budget ? `$${Number(p.budget).toLocaleString('es-MX')}` : '—'}</td>
                  <td className="row-actions">
                    <button className="ghost small" onClick={() => open(p)}>Editar</button>
                    <button className="ghost small danger" onClick={() => remove(p._id)}>Eliminar</button>
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

function Field({ label, v, onChange, type = 'text', required, textarea }) {
  return (
    <label>{label}
      {textarea
        ? <textarea value={v || ''} onChange={(e) => onChange(e.target.value)} rows={3} />
        : <input type={type} value={v || ''} onChange={(e) => onChange(e.target.value)} required={required} />}
    </label>
  );
}
