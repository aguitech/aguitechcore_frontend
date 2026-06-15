import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const EMPTY = { name: '', company: '', email: '', phone: '', notes: '', status: 'activo' };

const STATUS = {
  activo: { label: 'Activo', color: '#22c55e' },
  pausado: { label: 'Pausado', color: '#f59e0b' },
  baja: { label: 'Baja', color: '#ef4444' },
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/clients');
    setClients(data);
  }
  useEffect(() => { load(); }, []);

  function open(client = null) {
    setEditing(client ? client._id : 'new');
    setForm(client ? { ...client } : EMPTY);
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing === 'new') await api.post('/clients', form);
      else await api.put(`/clients/${editing}`, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar cliente?')) return;
    await api.delete(`/clients/${id}`);
    load();
  }

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Clientes</h1>
          <p className="muted">{clients.length} clientes registrados</p>
        </div>
        <button onClick={() => open()} className="primary">+ Nuevo cliente</button>
      </header>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</h3>
            {error && <div className="alert">{error}</div>}
            <div className="grid-2">
              <Field label="Nombre *" v={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Empresa" v={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Field label="Email *" v={form.email} type="email" onChange={(v) => setForm({ ...form, email: v })} required />
              <Field label="Teléfono" v={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <Field label="Notas" v={form.notes} onChange={(v) => setForm({ ...form, notes: v })} textarea />
            <label>Estado
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {clients.length === 0 ? (
          <p className="muted">Sin clientes. Crea el primero con "+ Nuevo cliente".</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Nombre</th><th>Empresa</th><th>Email</th><th>Teléfono</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c._id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.company || '—'}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td><span className="pill" style={{ background: STATUS[c.status].color }}>{STATUS[c.status].label}</span></td>
                  <td className="row-actions">
                    <button className="ghost small" onClick={() => open(c)}>Editar</button>
                    <button className="ghost small danger" onClick={() => remove(c._id)}>Eliminar</button>
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
