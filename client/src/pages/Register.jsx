import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// =============================================================
// PUBLIC REGISTER PAGE — accessible at /register WITHOUT login.
// Creates a new account with role: 'member' (admin/member roles
// are assigned by an existing admin via the Users panel).
//
// Flow:
//   1. User fills name + email + password + confirm
//   2. Client-side validation: passwords match, password ≥ 8 chars,
//      email format, name not empty.
//   3. POST /api/auth/register → 201 { token, user }
//   4. AuthContext.register() stashes token + user in localStorage
//      so the user lands logged in on the dashboard.
// =============================================================

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Client-side checks before we even hit the API. The server still
  // re-validates with express-validator — this is just to give the user
  // immediate feedback and avoid a wasted round-trip.
  function validate() {
    const name = form.name.trim();
    const email = form.email.trim();
    const password = form.password;
    const confirm = form.confirm;

    if (!name) return 'El nombre es requerido';
    if (name.length < 2) return 'El nombre debe tener al menos 2 caracteres';
    if (name.length > 80) return 'El nombre es demasiado largo (máx 80 caracteres)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email inválido';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (password.length > 128) return 'La contraseña es demasiado larga (máx 128 caracteres)';
    if (password !== confirm) return 'Las contraseñas no coinciden';
    return null;
  }

  // Strength meter — purely cosmetic, gives the user a sense of
  // how secure their password is. NOT enforced server-side.
  function passwordStrength(p) {
    if (!p) return { score: 0, label: '' };
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const labels = ['', 'muy débil', 'débil', 'aceptable', 'buena', 'fuerte', 'muy fuerte'];
    return { score, label: labels[Math.min(score, 6)] };
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      navigate('/dashboard');
    } catch (err) {
      // Surface the most common cases with friendlier text.
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.response?.data?.msg;
      if (status === 409 || /ya está registrado/i.test(msg || '')) {
        setError('Ya existe una cuenta con ese email. ¿Quieres iniciar sesión?');
      } else if (status === 400 && Array.isArray(err.response?.data?.errors)) {
        // express-validator shape
        setError(err.response.data.errors.map((e) => e.msg).join(' · '));
      } else {
        setError(msg || 'Error al crear la cuenta. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  const strength = passwordStrength(form.password);

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={onSubmit} autoComplete="on" noValidate>
        <div className="auth-brand">
          <img
            src="/img/logo.png"
            alt="Aguitech"
            className="auth-logo"
            draggable="false"
          />
          <h1 className="auth-title">Aguitech</h1>
        </div>
        <p className="muted auth-tagline">Crea tu cuenta gratis</p>

        {error && <div className="alert" role="alert">{error}</div>}

        <label>
          Nombre
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Héctor Aguilar"
            autoComplete="name"
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {form.password && (
            <div className="password-strength" aria-live="polite">
              <div className="password-strength-bar">
                <div
                  className={`password-strength-fill s${strength.score}`}
                  style={{ width: `${(strength.score / 6) * 100}%` }}
                />
              </div>
              <span className="muted small">{strength.label}</span>
            </div>
          )}
        </label>

        <label>
          Confirmar contraseña
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none' }}>
            Inicia sesión
          </Link>
        </p>

        <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/public/blog" style={{ color: 'var(--accent, #FF6A00)', textDecoration: 'none' }}>
            📰 Leer el blog público
          </Link>
        </p>
      </form>
    </div>
  );
}