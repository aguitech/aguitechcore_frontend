import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const COLUMNS = [
  { key: 'pendiente', label: 'Pendiente', color: '#94a3b8' },
  { key: 'en_curso', label: 'En curso', color: '#FF6A00' },
  { key: 'hecho', label: 'Hecho', color: '#22c55e' },
];

const PRIORITY_COLORS = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e' };

const EMPTY = { title: '', description: '', status: 'pendiente', priority: 'media', dueDate: '', project: '', client: '' };

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  async function load() {
    const [t, p, c] = await Promise.all([
      api.get('/tasks'),
      api.get('/dashboard/projects'),
      api.get('/clients'),
    ]);
    setTasks(t.data);
    setProjects(p.data);
    setClients(c.data);
  }
  useEffect(() => { load(); }, []);

  function open(task = null) {
    setEditing(task ? task._id : 'new');
    setForm(task
      ? {
          ...task,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
          project: task.project?._id || '',
          client: task.client?._id || '',
        }
      : EMPTY);
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, project: form.project || null, client: form.client || null };
      if (!payload.dueDate) delete payload.dueDate;
      if (editing === 'new') await api.post('/tasks', payload);
      else await api.put(`/tasks/${editing}`, payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  }

  async function changeStatus(task, status) {
    await api.put(`/tasks/${task._id}`, { status });
    load();
  }

  async function remove(id) {
    if (!confirm('¿Eliminar tarea?')) return;
    await api.delete(`/tasks/${id}`);
    load();
  }

  const grouped = COLUMNS.reduce((acc, c) => { acc[c.key] = tasks.filter((t) => t.status === c.key); return acc; }, {});

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Tareas</h1>
          <p className="muted">Tablero kanban · {tasks.length} tareas totales</p>
        </div>
        <button onClick={() => open()} className="primary">+ Nueva tarea</button>
      </header>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nueva tarea' : 'Editar tarea'}</h3>
            {error && <div className="alert">{error}</div>}
            <Field label="Título *" v={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
            <Field label="Descripción" v={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />
            <div className="grid-2">
              <label>Estado
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label>Prioridad
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
              <label>Fecha límite
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>Proyecto
                <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                  <option value="">— Ninguno —</option>
                  {projects.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
                </select>
              </label>
            </div>
            <label>Cliente
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">— Ninguno —</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <div className="kanban">
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-col" style={{ borderTop: `3px solid ${col.color}` }}>
            <header>
              <strong>{col.label}</strong>
              <span className="count">{grouped[col.key].length}</span>
            </header>
            <div className="kanban-list">
              {grouped[col.key].length === 0 && <p className="muted small">Vacío</p>}
              {grouped[col.key].map((t) => (
                <article key={t._id} className="task-card" onClick={() => open(t)}>
                  <div className="task-head">
                    <strong>{t.title}</strong>
                    <span className="prio" style={{ background: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                  </div>
                  {t.description && <p className="muted small">{t.description.slice(0, 80)}{t.description.length > 80 && '…'}</p>}
                  <div className="task-meta">
                    {t.project && <span>📁 {t.project.title}</span>}
                    {t.client && <span>👤 {t.client.name}</span>}
                    {t.dueDate && <span>📅 {new Date(t.dueDate).toLocaleDateString('es-MX')}</span>}
                  </div>
                  <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                    {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                      <button key={c.key} className="ghost small" onClick={() => changeStatus(t, c.key)}>→ {c.label}</button>
                    ))}
                    <button className="ghost small danger" onClick={() => remove(t._id)}>×</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
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
