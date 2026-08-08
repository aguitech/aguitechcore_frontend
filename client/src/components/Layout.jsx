import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const NAV_BASE = [
  { to: '/dashboard', label: 'Dashboard', icon: '◆' },
  { to: '/clients', label: 'Clientes', icon: '◎' },
  { to: '/projects', label: 'Proyectos', icon: '▣' },
  { to: '/tasks', label: 'Tareas', icon: '✓' },
  { to: '/incidents', label: 'Incidencias', icon: '🚨' },
  { to: '/appointments', label: 'Citas', icon: '◷' },
  { to: '/calendar', label: 'Calendario', icon: '◫' },
  { to: '/chat', label: 'Chat', icon: '◉' },
  { to: '/blog', label: 'Blog', icon: '◐' },
];

const NAV_ADMIN = [
  { to: '/users', label: 'Usuarios', icon: '◍' },
  { to: '/audit-log', label: 'Bitácora', icon: '◰' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const close = () => setMobileOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 860) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function onLogout() {
    if (confirm('¿Cerrar sesión?')) {
      logout();
      navigate('/login');
    }
  }

  const navItems = [
    ...NAV_BASE,
    ...(user?.role === 'admin' ? NAV_ADMIN : []),
    { to: '/profile', label: 'Perfil', icon: '◧' },
  ];

  return (
    <div className="layout">
      {/* Mobile hamburger */}
      <button
        type="button"
        className="mobile-hamburger"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        title="Menú"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          type="button"
          className="mobile-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          title="Cerrar"
        >×</button>

        <div className="brand">
          <div className="brand-mark">
            <span className="brand-mark-inner">⚡</span>
          </div>
          <div className="brand-text">
            <strong>Aguitech</strong>
            <small>Core</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              <span className="nav-glow" aria-hidden="true" />
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

      <main className="main">
        <div className="topbar">
          <div className="topbar-spacer" />
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
