import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

export default function Profile() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });

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

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Perfil</h1>
          <p className="muted">Administra tu cuenta</p>
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
            <input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required minLength={6} />
          </label>
          <div className="row-end">
            <button type="submit" className="primary">Cambiar contraseña</button>
          </div>
        </form>
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
