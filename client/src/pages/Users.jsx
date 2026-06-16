import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY = { name: '', email: '', password: '', role: 'member', phone: '', active: true };

const ROLE_COLORS = {
  admin: '#ef4444',
  manager: '#f59e0b',
  member: '#3b82f6',
  client: '#22c55e',
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState({ roles: [], labels: {}, descriptions: {} });
  const [filter, setFilter] = useState('todos');

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data);
  }
  async function loadRoles() {
    const { data } = await api.get('/users/roles');
    setRoles(data);
  }
  useEffect(() => { load(); loadRoles(); }, []);

  function open(user = null) {
    setEditing(user ? user._id : 'new');
    setForm(user
      ? { name: user.name, email: user.email, password: '', role: user.role, phone: user.phone || '', active: user.active ?? true }
      : EMPTY
    );
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      // On edit, only send password if user typed one
      if (editing !== 'new' && !payload.password) delete payload.password;
      if (editing === 'new') {
        await api.post('/users', payload);
      } else {
        await api.put(`/users/${editing}`, payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  }

  async function remove(id) {
    if (id === currentUser?._id) return alert('No puedes eliminarte a ti mismo');
    if (!confirm('¿Eliminar usuario?')) return;
    await api.delete(`/users/${id}`);
    load();
  }

  async function toggleActive(u) {
    await api.put(`/users/${u._id}`, { active: !u.active });
    load();
  }

  const filtered = filter === 'todos' ? users : users.filter(u => u.role === filter);

  // Only admins can see this page
  if (currentUser?.role !== 'admin') {
    return (
      <Layout>
        <div className="card center">
          <h2>🔒 Acceso restringido</h2>
          <p className="muted">Solo administradores pueden gestionar usuarios.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Usuarios</h1>
          <p className="muted">{users.length} usuarios · {filtered.length} visibles</p>
        </div>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-sm">
            <option value="todos">Todos los roles</option>
            {roles.roles.map(r => (
              <option key={r} value={r}>{roles.labels[r]}</option>
            ))}
          </select>
          <button onClick={() => open()} className="primary">+ Nuevo usuario</button>
        </div>
      </header>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'}</h3>
            {error && <div className="alert">{error}</div>}
            <div className="grid-2">
              <Field label="Nombre *" v={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Email *" v={form.email} type="email" onChange={(v) => setForm({ ...form, email: v })} required />
            </div>
            <div className="grid-2">
              <Field
                label={editing === 'new' ? 'Contraseña *' : 'Nueva contraseña (opcional)'}
                v={form.password}
                type="password"
                onChange={(v) => setForm({ ...form, password: v })}
                required={editing === 'new'}
              />
              <Field label="Teléfono" v={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <label>Rol
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.roles.map(r => (
                  <option key={r} value={r}>{roles.labels[r]}</option>
                ))}
              </select>
            </label>
            {roles.descriptions[form.role] && (
              <p className="muted small">ℹ️ {roles.descriptions[form.role]}</p>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>Usuario activo (puede iniciar sesión)</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <p className="muted">Sin usuarios{filter !== 'todos' ? ` con rol "${filter}"` : ''}. Crea el primero.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div className="user-row">
                      <div className="avatar-sm" style={{ background: ROLE_COLORS[u.role] }}>
                        {u.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <strong>{u.name}</strong>
                        {u.phone && <div className="muted small">{u.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="pill" style={{ background: ROLE_COLORS[u.role] || '#666' }}>
                      {roles.labels[u.role] || u.role}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`pill-toggle ${u.active ? 'on' : 'off'}`}
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? '● Activo' : '○ Inactivo'}
                    </button>
                  </td>
                  <td className="muted small">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('es-MX') : 'Nunca'}
                  </td>
                  <td className="row-actions">
                    <button className="ghost small" onClick={() => open(u)}>Editar</button>
                    {u._id !== currentUser?._id && (
                      <button className="ghost small danger" onClick={() => remove(u._id)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>ℹ️ Niveles de acceso</h3>
        <div className="roles-grid">
          {roles.roles.map(r => (
            <div key={r} className="role-card">
              <span className="pill" style={{ background: ROLE_COLORS[r] }}>{roles.labels[r]}</span>
              <p className="muted small">{roles.descriptions[r]}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, v, onChange, type = 'text', required }) {
  return (
    <label>{label}
      <input type={type} value={v || ''} onChange={(e) => onChange(e.target.value)} required={required} />
    </label>
  );
}
