import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_BASE = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/clients', label: 'Clientes', icon: '👥' },
  { to: '/projects', label: 'Proyectos', icon: '📁' },
  { to: '/tasks', label: 'Tareas', icon: '✅' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/chat', label: 'Chat', icon: '💬' },
];

const NAV_ADMIN = { to: '/users', label: 'Usuarios', icon: '👤' };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer when the route changes
  useEffect(() => {
    const close = () => setMobileOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Close on resize to desktop width
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
    ...(user?.role === 'admin' ? [NAV_ADMIN] : []),
    { to: '/profile', label: 'Perfil', icon: '⚙️' },
  ];

  return (
    <div className="layout">
      {/* ============ Mobile hamburger (estilo aguitech.com) ============ */}
      <button
        type="button"
        className="mobile-hamburger"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        title="Menú"
      >
        <span></span>
        <span></span>
      </button>

      {/* ============ Mobile overlay ============ */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ============ Sidebar (drawer on mobile, fixed on desktop) ============ */}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          type="button"
          className="mobile-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          title="Cerrar"
        >×</button>

        <div className="brand">
          <span className="logo">⚡</span>
          <div>
            <strong>Aguitech</strong>
            <small>Core</small>
          </div>
        </div>
        <nav>
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
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
