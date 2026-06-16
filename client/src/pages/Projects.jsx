import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const STATUS = {
  activo: { label: 'Activo', color: '#22c55e' },
  pausado: { label: 'Pausado', color: '#f59e0b' },
  completado: { label: 'Completado', color: '#3b82f6' },
};

const EMPTY = {
  title: '',
  clientId: '',
  status: 'activo',
  progress: 0,
  description: '',
  budget: '',
  startDate: '',
  endDate: '',
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [memberRoles, setMemberRoles] = useState({ roles: [], labels: {} });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('todos');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('colaborador');
  const [memberMsg, setMemberMsg] = useState({ type: '', text: '' });

  async function load() {
    const [pRes, cRes, rRes] = await Promise.all([
      api.get('/dashboard/projects'),
      api.get('/clients'),
      api.get('/dashboard/projects/member-roles'),
    ]);
    setProjects(pRes.data);
    setClients(cRes.data);
    setMemberRoles(rRes.data);
  }
  useEffect(() => { load(); }, []);

  function open(project = null) {
    setEditing(project ? project._id : 'new');
    setForm(project
      ? {
          title: project.title || '',
          clientId: project.client?._id || project.client || '',
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
    setMemberMsg({ type: '', text: '' });
    setNewMemberEmail('');
    setNewMemberRole('colaborador');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      if (payload.budget === '') delete payload.budget;
      else payload.budget = Number(payload.budget);
      if (!payload.clientId) {
        setError('Selecciona un cliente');
        return;
      }
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

  async function addMember() {
    if (!newMemberEmail) return;
    setMemberMsg({ type: '', text: '' });
    try {
      const { data } = await api.post(`/dashboard/projects/${editing}/members`, {
        email: newMemberEmail,
        role: newMemberRole,
      });
      // Update the editing project in place
      setProjects(projects.map(p => p._id === editing ? data : p));
      // Also update the form to reflect
      setForm({ ...form });
      setNewMemberEmail('');
      setMemberMsg({ type: 'ok', text: 'Miembro agregado ✓' });
      // Reload to get the populated members
      load();
    } catch (err) {
      setMemberMsg({ type: 'err', text: err.response?.data?.message || 'Error' });
    }
  }

  async function removeMember(userId) {
    if (!confirm('¿Quitar este miembro?')) return;
    try {
      const { data } = await api.delete(`/dashboard/projects/${editing}/members/${userId}`);
      setProjects(projects.map(p => p._id === editing ? data : p));
      load();
    } catch (err) {
      setMemberMsg({ type: 'err', text: err.response?.data?.message || 'Error' });
    }
  }

  const editingProject = editing && editing !== 'new'
    ? projects.find(p => p._id === editing)
    : null;

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
          <form className="modal modal-lg" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nuevo proyecto' : 'Editar proyecto'}</h3>
            {error && <div className="alert">{error}</div>}
            <div className="grid-2">
              <Field label="Título *" v={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
              <label>Cliente *
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
                  <option value="">— Selecciona un cliente —</option>
                  {clients.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name}{c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </label>
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
              <button type="submit" className="primary">Guardar proyecto</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal separado para gestionar miembros del proyecto */}
      {editingProject && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h3>👥 Equipo del proyecto</h3>
            <p className="muted small" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
              <strong>{editingProject.title}</strong>
              {editingProject.client && <> · Cliente: <strong>{editingProject.client.name}</strong></>}
            </p>

            {memberMsg.text && (
              <div className={`alert ${memberMsg.type === 'ok' ? 'ok' : ''}`}>{memberMsg.text}</div>
            )}

            {/* === Sección: Agregar miembro === */}
            <div className="add-member-section">
              <h4 className="section-title">➕ Agregar persona al equipo</h4>
              <p className="muted small section-help">
                Escribe el email de un usuario registrado. El sistema lo buscará y lo agregará al equipo de este proyecto.
              </p>

              <div className="add-member-form">
                <label className="full-width">
                  <span className="label-text">📧 Email del usuario</span>
                  <input
                    type="email"
                    className="big-input"
                    placeholder="ejemplo@empresa.com"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }}
                    autoFocus
                  />
                </label>

                <label className="full-width">
                  <span className="label-text">🎭 Rol en este proyecto</span>
                  <select
                    className="big-input"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                  >
                    {memberRoles.roles?.map(r => (
                      <option key={r} value={r}>{memberRoles.labels[r] || r}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="primary big-btn"
                  onClick={addMember}
                  disabled={!newMemberEmail}
                >
                  ➕ Agregar al equipo
                </button>
              </div>
            </div>

            {/* === Sección: Miembros actuales === */}
            <div className="members-section">
              <h4 className="section-title">
                👥 Miembros actuales ({editingProject.members?.length || 0})
              </h4>

              {editingProject.members?.length > 0 ? (
                <div className="members-list">
                  {editingProject.members.map((m) => (
                    <div key={m.user._id} className="member-card">
                      <div className="member-avatar" style={{ background: ROLE_COLORS[m.role] || '#3b82f6' }}>
                        {m.user.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="member-info">
                        <strong>{m.user.name}</strong>
                        <div className="muted small">{m.user.email}</div>
                      </div>
                      <span className="pill member-role" style={{ background: ROLE_COLORS[m.role] || '#666' }}>
                        {memberRoles.labels?.[m.role]?.split(' (')[0] || m.role}
                      </span>
                      <button
                        type="button"
                        className="ghost small danger"
                        onClick={() => removeMember(m.user._id)}
                        title={`Quitar a ${m.user.name}`}
                      >
                        ✕ Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p className="muted">📭 Aún no hay personas en el equipo de este proyecto.</p>
                  <p className="muted small">Usa el formulario de arriba para agregar a la primera persona.</p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>✓ Cerrar</button>
            </div>
          </div>
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
                <th>Equipo</th>
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
                  <td>
                    {p.client ? (
                      <>
                        <strong>{p.client.name}</strong>
                        {p.client.company && <div className="muted small">{p.client.company}</div>}
                      </>
                    ) : '—'}
                  </td>
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
                  <td>
                    {p.members?.length > 0 ? (
                      <div className="avatar-group">
                        {p.members.slice(0, 3).map((m) => (
                          <div key={m.user._id} className="avatar-sm" title={`${m.user.name} (${memberRoles.labels[m.role] || m.role})`}>
                            {m.user.name?.[0]?.toUpperCase() || '?'}
                          </div>
                        ))}
                        {p.members.length > 3 && (
                          <div className="avatar-sm avatar-more">+{p.members.length - 3}</div>
                        )}
                      </div>
                    ) : (
                      <span className="muted small">Sin equipo</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button className="ghost small" onClick={() => open(p)}>Editar</button>
                    <button className="ghost small" onClick={() => { setEditing(p._id); setMemberMsg({ type: '', text: '' }); }}>👥 Equipo</button>
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
