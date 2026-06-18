import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

export default function Profile() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [justCreated, setJustCreated] = useState(null); // { plaintext, ... } shown once
  const [copyState, setCopyState] = useState('');

  async function loadKeys() {
    try {
      const { data } = await api.get('/profile/apikeys');
      setKeys(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando API keys', err);
    }
  }

  useEffect(() => { loadKeys(); }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    try {
      const { data } = await api.put('/profile', profile);
      localStorage.setItem('user', JSON.stringify(data.user));
      setMsg({ type: 'ok', text: 'Perfil actualizado ✓' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Error' });
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    if (pwd.next !== pwd.confirm) return setMsg({ type: 'err', text: 'Las contraseñas no coinciden' });
    try {
      await api.put('/profile/password', { current: pwd.current, next: pwd.next });
      setPwd({ current: '', next: '', confirm: '' });
      setMsg({ type: 'ok', text: 'Contraseña cambiada ✓' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Error' });
    }
  }

  async function createKey(e) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const { data } = await api.post('/profile/apikeys', { name: newKeyName.trim() });
      setJustCreated(data);
      setNewKeyName('');
      loadKeys();
    } catch (err) {
      alert(err.response?.data?.message || 'Error creando la key');
    }
  }

  async function toggleKey(k) {
    try {
      await api.patch(`/profile/apikeys/${k._id}`, { enabled: !k.enabled });
      loadKeys();
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  }

  async function deleteKey(k) {
    if (!confirm(`¿Revocar la API key "${k.name}"? Esto la invalida permanentemente.`)) return;
    try {
      await api.delete(`/profile/apikeys/${k._id}`);
      loadKeys();
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('¡Copiado!');
      setTimeout(() => setCopyState(''), 2000);
    } catch {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setCopyState('¡Copiado!'); }
      catch { setCopyState('No se pudo copiar'); }
      document.body.removeChild(ta);
      setTimeout(() => setCopyState(''), 2000);
    }
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  }

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Perfil</h1>
          <p className="muted">Administra tu cuenta y access keys</p>
        </div>
      </header>

      {msg.text && <div className={`alert ${msg.type === 'ok' ? 'ok' : ''}`}>{msg.text}</div>}

      <div className="grid-2">
        <form className="card" onSubmit={saveProfile}>
          <h3>Datos personales</h3>
          <label>Nombre
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          </label>
          <label>Email
            <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
          </label>
          <label>Teléfono
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </label>
          <div className="row-end">
            <button type="submit" className="primary">Guardar cambios</button>
          </div>
        </form>

        <form className="card" onSubmit={changePassword}>
          <h3>Cambiar contraseña</h3>
          <label>Contraseña actual
            <input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required />
          </label>
          <label>Nueva contraseña
            <input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required minLength={6} />
          </label>
          <label>Confirmar nueva
            <input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: pwd.confirm })} required minLength={6} />
          </label>
          <div className="row-end">
            <button type="submit" className="primary">Cambiar contraseña</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head-row">
          <div>
            <h3 style={{ margin: 0 }}>API Keys (MCP)</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Conecta agentes IA a tu cuenta. Cada key respeta tus permisos actuales:
              solo verás y actuarás sobre proyectos donde eres dueño o miembro.
            </p>
          </div>
        </div>

        {justCreated && (
          <div className="alert ok" style={{ marginTop: 16 }}>
            <strong>¡Guarda este token ahora!</strong> No se mostrará de nuevo.
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <code style={{
                background: '#0f172a', color: '#FF6A00', padding: '8px 12px',
                borderRadius: 6, fontFamily: 'monospace', fontSize: 13,
                wordBreak: 'break-all', flex: 1, minWidth: 200,
              }}>
                {justCreated.plaintext}
              </code>
              <button className="primary" type="button" onClick={() => copyToClipboard(justCreated.plaintext)}>
                Copiar
              </button>
              <button className="ghost" type="button" onClick={() => setJustCreated(null)}>Cerrar</button>
            </div>
            {copyState && <span style={{ marginLeft: 8 }}>{copyState}</span>}
          </div>
        )}

        <form onSubmit={createKey} style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 220 }}>
            Nombre de la nueva key
            <input
              placeholder="ej. Hermes Bot, Mi laptop, Cursor IDE"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className="primary" style={{ marginBottom: 0 }}>Generar API key</button>
        </form>

        <div style={{ marginTop: 24 }}>
          {keys.length === 0 ? (
            <p className="muted">Aún no tienes API keys. Genera una para empezar.</p>
          ) : (
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Prefix</th>
                  <th>Última vez usada</th>
                  <th>Creada</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k._id}>
                    <td><strong>{k.name}</strong></td>
                    <td><code>{k.prefix}…{k.suffix}</code></td>
                    <td>{formatDate(k.lastUsedAt)}</td>
                    <td>{formatDate(k.createdAt)}</td>
                    <td>
                      <span className={`pill ${k.enabled ? 'pill-ok' : 'pill-off'}`}>
                        {k.enabled ? 'Activa' : 'Deshabilitada'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button className="ghost" type="button" onClick={() => toggleKey(k)}>
                        {k.enabled ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                      <button className="ghost danger" type="button" onClick={() => deleteKey(k)}>
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>
            ¿Cómo uso mi API key?
          </summary>
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>
            <p>Tu key es un token Bearer. Ejemplo de uso con <code>curl</code>:</p>
            <pre style={{
              background: '#0f172a', padding: 12, borderRadius: 6, overflow: 'auto',
              fontSize: 12, fontFamily: 'monospace', color: '#FF6A00',
            }}>{`curl -X POST https://tu-dominio.com/api/mcp \\
  -H "Authorization: Bearer agk_TU_KEY_AQUI" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
            <p>Las herramientas disponibles se listan con <code>tools/list</code>. Para invocar una:</p>
            <pre style={{
              background: '#0f172a', padding: 12, borderRadius: 6, overflow: 'auto',
              fontSize: 12, fontFamily: 'monospace', color: '#FF6A00',
            }}>{`{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_task",
    "arguments": {
      "project_id": "...",
      "title": "Nueva tarea",
      "assignee_email": "feli@aguittech.com"
    }
  }
}`}</pre>
          </div>
        </details>
      </div>

      <div className="card">
        <h3>Sesión</h3>
        <p className="muted">Sesión iniciada como <strong>{user?.email}</strong> ({user?.role})</p>
        <div className="row-end">
          <button className="ghost" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>
    </Layout>
  );
}
