import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

const HOURS = [];
for (let h = 9; h <= 18; h++) {
  HOURS.push(`${String(h).padStart(2, '0')}:00`);
  HOURS.push(`${String(h).padStart(2, '0')}:30`);
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [form, setForm] = useState({
    customerName: user?.name || '',
    customerEmail: user?.email || '',
    customerPhone: '',
    assignedTo: '',
    subject: '',
    description: '',
    location: 'Google Meet',
  });
  const [selectedTime, setSelectedTime] = useState(null);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/appointments/public/staff').then((r) => setStaff(r.data || [])).catch(() => setStaff([]));
  }, []);

  // Build calendar grid
  const calendarDays = (() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startWd = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWd; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  })();

  async function loadAvailability(date) {
    setLoading(true);
    try {
      const r = await api.get('/appointments/public/availability', {
        params: {
          date: date.toISOString().slice(0, 10),
          assignee: form.assignedTo || undefined,
        },
      });
      setAvailability(r.data);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedDate) loadAvailability(selectedDate);
  }, [selectedDate, form.assignedTo]);

  // Compute taken slots for the selected day
  const takenStarts = new Set();
  if (availability && selectedDate) {
    for (const slot of availability.bookedSlots || []) {
      const s = new Date(slot.startsAt);
      takenStarts.add(s.toTimeString().slice(0, 5));
    }
  }

  function isSlotTaken(hhmm) {
    return takenStarts.has(hhmm);
  }

  async function submit() {
    setError('');
    if (!form.customerName.trim()) return setError('Tu nombre es requerido');
    if (!form.subject.trim()) return setError('Cuéntanos el motivo de la cita');
    if (!selectedDate || !selectedTime) return setError('Selecciona fecha y hora');
    setBusy(true);
    try {
      const startsAt = new Date(`${selectedDate.toISOString().slice(0, 10)}T${selectedTime}:00`);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      const r = await api.post('/appointments/public', {
        ...form,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setSuccess(r.data);
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al agendar');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSuccess(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setForm({ ...form, subject: '', description: '' });
  }

  return (
    <div className="landing">
      {/* Animated grid backdrop */}
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-glow-orb glow-orb-1" aria-hidden="true" />
      <div className="landing-glow-orb glow-orb-2" aria-hidden="true" />

      <header className="landing-nav">
        <Link to="/public/blog" className="landing-brand">
          <span className="landing-logo">
            <span className="landing-logo-inner">⚡</span>
          </span>
          <strong>Aguitech</strong> <span>Core</span>
        </Link>
        <nav className="landing-nav-links">
          <a href="#features">Características</a>
          <a href="#agendar">Agendar</a>
          <Link to="/public/blog">Blog</Link>
          {user ? (
            <Link to="/dashboard" className="landing-cta small">Ir al panel →</Link>
          ) : (
            <Link to="/login" className="landing-cta small">Iniciar sesión</Link>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <span className="landing-eyebrow">
            <span className="landing-eyebrow-dot" />
            SOFTWARE A LA MEDIDA · HECHO EN MÉXICO
          </span>
          <h1>
            <span className="landing-hero-line">Soluciones</span>
            <span className="landing-accent landing-hero-line">digitales</span>
            <span className="landing-hero-line">para tu negocio</span>
          </h1>
          <p className="landing-sub">
            Apps web, automatizaciones, integraciones con IA y dashboards
            inteligentes. Agenda una llamada de 30 minutos y cuéntanos tu idea.
          </p>
          <div className="landing-hero-actions">
            <a href="#agendar" className="landing-cta">📅 Agendar cita gratuita</a>
            <Link to="/public/blog" className="landing-cta secondary">📰 Leer el blog</Link>
          </div>
          <div className="landing-trust">
            <span><strong>+30</strong> clientes</span>
            <span className="landing-trust-sep">·</span>
            <span><strong>+50</strong> proyectos</span>
            <span className="landing-trust-sep">·</span>
            <span><strong>+200</strong> tareas completadas</span>
          </div>
        </div>
        <div className="landing-hero-art" aria-hidden="true">
          <div className="landing-art-card">
            <span className="landing-art-icon">📊</span>
            <span>Dashboard en vivo</span>
            <span className="landing-art-bar"><span style={{ width: '78%' }} /></span>
          </div>
          <div className="landing-art-card">
            <span className="landing-art-icon">💬</span>
            <span>Chat en tiempo real</span>
            <span className="landing-art-pulse" />
          </div>
          <div className="landing-art-card">
            <span className="landing-art-icon">📅</span>
            <span>Citas automatizadas</span>
            <span className="landing-art-counter">24/7</span>
          </div>
          <div className="landing-art-card">
            <span className="landing-art-icon">📰</span>
            <span>Blog público</span>
            <span className="landing-art-badge">NEW</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features" id="features">
        <h2>¿Qué construimos para ti?</h2>
        <div className="landing-feat-grid">
          <div className="landing-feat">
            <span className="landing-feat-icon">🌐</span>
            <h3>Aplicaciones web</h3>
            <p>SPA modernas con React, dashboards responsivos, autenticación, base de datos y deploy en tu dominio.</p>
          </div>
          <div className="landing-feat">
            <span className="landing-feat-icon">🤖</span>
            <h3>Automatizaciones e IA</h3>
            <p>Conectamos tus sistemas con LLMs, generamos contenido, automatizamos respuestas y reportes.</p>
          </div>
          <div className="landing-feat">
            <span className="landing-feat-icon">📱</span>
            <h3>Apps móviles</h3>
            <p>React Native y PWA para que tu equipo trabaje desde cualquier lugar con la misma experiencia.</p>
          </div>
          <div className="landing-feat">
            <span className="landing-feat-icon">📊</span>
            <h3>Dashboards y métricas</h3>
            <p>Visualizaciones en tiempo real de tu negocio, exportes automáticos, alertas cuando algo se mueve.</p>
          </div>
          <div className="landing-feat">
            <span className="landing-feat-icon">🔗</span>
            <h3>Integraciones</h3>
            <p>Stripe, Twilio, WhatsApp Cloud, Google Workspace, Notion, Airtable, tu CRM. Lo conectamos todo.</p>
          </div>
          <div className="landing-feat">
            <span className="landing-feat-icon">🛡️</span>
            <h3>Seguridad y mantenimiento</h3>
            <p>Backups, monitoreo 24/7, SSL, rate limiting, bitácora de auditoría. Tu información está segura.</p>
          </div>
        </div>
      </section>

      {/* Booking widget */}
      <section className="landing-booking" id="agendar">
        <div className="landing-booking-wrap">
          <div className="landing-booking-head">
            <span className="landing-section-eyebrow">RESERVA EN 3 PASOS</span>
            <h2>Agenda tu cita</h2>
            <p className="muted">
              Elige el día, la hora y el tema. Te confirmamos por correo en menos de 24 h.
            </p>
          </div>

          {success ? (
            <div className="landing-success">
              <span style={{ fontSize: 64 }}>✅</span>
              <h3>¡Cita agendada!</h3>
              <p>
                <strong>{success.customerName}</strong>, tu cita de <em>{success.subject}</em><br />
                está agendada para el <strong>{fmtDate(success.startsAt)}</strong>.
              </p>
              <p className="muted">
                {success.location && <>Lugar: {success.location}<br /></>}
                Te enviamos un correo de confirmación a {success.customerEmail}.
              </p>
              <div className="actions">
                <button className="btn primary" onClick={reset}>Agendar otra</button>
                {user ? (
                  <Link to="/my-appointments" className="btn ghost">Ver mis citas</Link>
                ) : (
                  <Link to="/login" className="btn ghost">Iniciar sesión</Link>
                )}
              </div>
            </div>
          ) : (
            <div className="landing-booking-grid">
              {/* step 1: calendario */}
              <div className="landing-step">
                <div className="step-num">1</div>
                <h3>Elige el día</h3>
                <div className="calendar-toolbar">
                  <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
                  <strong>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</strong>
                  <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
                </div>
                <div className="calendar-grid small">
                  {WEEKDAYS.map((d) => <div key={d} className="cal-weekday">{d}</div>)}
                  {calendarDays.map((d, i) => {
                    if (!d) return <div key={`p-${i}`} className="cal-day empty" />;
                    const today = startOfDay(new Date());
                    const isPast = startOfDay(d) < today;
                    const isSunday = d.getDay() === 0;
                    const isSelected = selectedDate && startOfDay(d).getTime() === startOfDay(selectedDate).getTime();
                    const disabled = isPast || isSunday;
                    return (
                      <button
                        key={d.toISOString()}
                        className={`cal-day ${isSelected ? 'selected' : ''}`}
                        disabled={disabled}
                        onClick={() => { setSelectedDate(d); setSelectedTime(null); }}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
                <p className="muted small">No atendemos domingos ni días pasados.</p>
              </div>

              {/* step 2: hora */}
              <div className="landing-step">
                <div className="step-num">2</div>
                <h3>Elige la hora</h3>
                {!selectedDate ? (
                  <p className="muted">Selecciona primero un día en el calendario.</p>
                ) : loading ? (
                  <p className="muted">⏳ Verificando disponibilidad…</p>
                ) : (
                  <>
                    <div className="slot-grid">
                      {HOURS.map((h) => {
                        const taken = isSlotTaken(h);
                        const isSelected = selectedTime === h;
                        return (
                          <button
                            key={h}
                            className={`slot ${isSelected ? 'selected' : ''} ${taken ? 'taken' : ''}`}
                            disabled={taken}
                            onClick={() => setSelectedTime(h)}
                            title={taken ? 'Ocupado' : 'Disponible'}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                    <label className="slot-duration">
                      Duración
                      <select className="input tiny" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))}>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>60 min</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              {/* step 3: datos */}
              <div className="landing-step">
                <div className="step-num">3</div>
                <h3>Tus datos</h3>
                <div className="form">
                  {error && <div className="banner error">{error}</div>}
                  <div className="row two">
                    <label>
                      Nombre *
                      <input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
                    </label>
                    <label>
                      Email
                      <input className="input" type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
                    </label>
                  </div>
                  <div className="row two">
                    <label>
                      Teléfono (WhatsApp)
                      <input className="input" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
                    </label>
                    <label>
                      ¿Con quién?
                      <select className="input" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                        <option value="">Sin preferencia</option>
                        {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>
                    Asunto *
                    <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="ej. Cotización de app a la medida" />
                  </label>
                  <label>
                    Cuéntanos más
                    <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </label>
                  <label>
                    Modalidad
                    <select className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                      <option>Google Meet</option>
                      <option>Zoom</option>
                      <option>Presencial (CDMX)</option>
                      <option>Teléfono</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn primary block"
                    onClick={submit}
                    disabled={busy || !selectedDate || !selectedTime}
                  >
                    {busy ? '⏳ Agendando…' : '📅 Confirmar cita'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-logo">
              <span className="landing-logo-inner">⚡</span>
            </span>
            <div>
              <strong>Aguitech Core</strong>
              <small>Plataforma de gestión empresarial</small>
            </div>
          </div>
          <div className="landing-footer-links">
            <Link to="/public/blog">Blog</Link>
            <Link to="/login">Acceder</Link>
            <Link to="/register">Registro</Link>
            <a href="mailto:hector@aguitech.com">Contacto</a>
          </div>
          <div className="landing-footer-meta">
            <span className="landing-footer-status">
              <span className="landing-footer-pulse" />
              Sistemas operativos
            </span>
            <small>© {new Date().getFullYear()} Aguitech · Hecho con ⚡ en México</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
