import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// =============================================================
// LOGIN PAGE — accessible at /login WITHOUT being logged in.
//
// Security/UX notes:
//   - Fields start EMPTY. No demo credentials pre-filled, no
//     placeholder hints showing real accounts. The admin email
//     used to be hard-coded here as defaultValue which leaked
//     the account existence and was a footgun for screenshots.
//   - The password is held only in component state (memory) and
//     is never written to localStorage. AuthContext stores only
//     the JWT + the user payload (which already excludes the
//     password thanks to User.toJSON()).
//   - Brand: "Aguitech" (one word, no space), with the official
//     logo served from /img/logo.png (bundled in client/public/).
// =============================================================

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email y contraseña son requeridos');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Clear the password from memory the moment we no longer need it.
      // The JWT + user object land in localStorage; the plaintext
      // password does not.
      setPassword('');
      navigate('/dashboard');
    } catch (err) {
      // Generic message — never disclose whether the email exists.
      setError(err.response?.data?.message || 'Email o contraseña incorrectos');
      // Clear the bad password so the user has to retype it.
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  // Clear the error as soon as the user starts editing either field —
  // feels natural and avoids the stale alert haunting the form.
  function onChangeEmail(e) {
    if (error) setError('');
    setEmail(e.target.value);
  }
  function onChangePassword(e) {
    if (error) setError('');
    setPassword(e.target.value);
  }

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={onSubmit} autoComplete="on" noValidate>
        <div className="auth-brand">
          <img
            src="/img/logo.png"
            alt=""
            className="auth-logo"
            draggable="false"
          />
        </div>
        <p className="muted auth-tagline">Inicia sesión para continuar</p>

        {error && <div className="alert" role="alert">{error}</div>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={onChangeEmail}
            placeholder="tu@email.com"
            autoComplete="email"
            spellCheck="false"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={onChangePassword}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          ¿No tienes cuenta?{' '}
          <Link to="/register" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none', fontWeight: 600 }}>
            Crear cuenta
          </Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
          <Link to="/public/blog" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none' }}>
            📰 Leer el blog público
          </Link>
        </p>
      </form>
    </div>
  );
}