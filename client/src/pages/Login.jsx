import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@aguittech.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={onSubmit}>
        <h1>🔐 Aguittech Core</h1>
        <p className="muted">Inicia sesión para continuar</p>
        {error && <div className="alert">{error}</div>}
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        <p className="muted small">Demo: admin@aguittech.com / admin123</p>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          ¿No tienes cuenta?{' '}
          <Link to="/register" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none', fontWeight: 600 }}>
            Crear cuenta
          </Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/public/blog" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none' }}>
            📰 Leer el blog público
          </Link>
        </p>
      </form>
    </div>
  );
}
