import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/clients', label: 'Clientes', icon: '👥' },
  { to: '/tasks', label: 'Tareas', icon: '✅' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/profile', label: 'Perfil', icon: '⚙️' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    if (confirm('¿Cerrar sesión?')) {
      logout();
      navigate('/login');
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">⚡</span>
          <div>
            <strong>Aguitech</strong>
            <small>Core</small>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <div className="avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
            <div className="user-info">
              <strong>{user?.name}</strong>
              <small>{user?.role}</small>
            </div>
          </div>
          <button onClick={onLogout} className="ghost block">Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
