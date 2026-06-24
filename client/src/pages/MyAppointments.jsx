import { useEffect, useState, useMemo } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const STATUS_META = {
  scheduled: { color: '#0ea5e9', label: '📅 Agendada' },
  confirmed: { color: '#10b981', label: '✓ Confirmada' },
  completed: { color: '#6b7280', label: '✔ Completada' },
  cancelled: { color: '#ef4444', label: '✕ Cancelada' },
  no_show:   { color: '#f59e0b', label: '⚠ No asististe' },
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MyAppointments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('upcoming');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/appointments', { params: { limit: 200 } });
      setItems(r.data || []);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const now = new Date();
  const upcoming = items.filter((a) => new Date(a.startsAt) >= now && !['cancelled', 'completed'].includes(a.status));
  const past = items.filter((a) => new Date(a.startsAt) < now || ['cancelled', 'completed'].includes(a.status));
  const shown = view === 'upcoming' ? upcoming : past;

  const itemsByDay = useMemo(() => {
    const map = new Map();
    for (const it of shown) {
      const key = new Date(it.startsAt).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [shown]);

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

  async function cancel(a) {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
      await api.patch(`/appointments/${a._id}`, { status: 'cancelled' });
      await load();
    } catch (err) {
      alert(err?.response?.data?.msg || 'Error al cancelar');
    }
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>📅 Mis citas</h1>
            <p className="muted">
              {upcoming.length} próxima(s) · {past.length} pasada(s)
            </p>
          </div>
          <div className="actions">
            <button className={`btn ${view === 'upcoming' ? 'primary' : 'ghost'}`} onClick={() => setView('upcoming')}>
              Próximas ({upcoming.length})
            </button>
            <button className={`btn ${view === 'past' ? 'primary' : 'ghost'}`} onClick={() => setView('past')}>
              Pasadas ({past.length})
            </button>
          </div>
        </div>

        {/* calendar overview */}
        <div className="appt-calendar">
          <div className="calendar-toolbar">
            <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
            <strong>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</strong>
            <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map((d) => <div key={d} className="cal-weekday">{d}</div>)}
            {calendarDays.map((d, i) => {
              if (!d) return <div key={`p-${i}`} className="cal-day empty" />;
              const key = startOfDay(d).toISOString().slice(0, 10);
              const dayItems = itemsByDay.get(key) || [];
              return (
                <div key={key} className="cal-day">
                  <span className="cal-day-num">{d.getDate()}</span>
                  <div className="cal-day-dots">
                    {dayItems.slice(0, 4).map((it) => {
                      const m = STATUS_META[it.status] || STATUS_META.scheduled;
                      return <span key={it._id} className="cal-dot" style={{ background: m.color }} title={it.subject} />;
                    })}
                    {dayItems.length > 4 && <span className="cal-more">+{dayItems.length - 4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* list */}
        <h2 className="section-h2">{view === 'upcoming' ? 'Próximas citas' : 'Historial'}</h2>
        {loading && <div className="muted center pad">⏳ Cargando…</div>}
        {!loading && shown.length === 0 && (
          <div className="empty">
            <span style={{ fontSize: 60 }}>📅</span>
            <h3>Sin citas {view === 'upcoming' ? 'próximas' : 'pasadas'}</h3>
            <p className="muted">
              {view === 'upcoming'
                ? 'Agenda una cita desde la página principal.'
                : 'Cuando completes una cita, aparecerá aquí.'}
            </p>
            {view === 'upcoming' && (
              <a href="/" className="btn primary">📅 Agendar nueva cita</a>
            )}
          </div>
        )}

        <div className="appt-list">
          {shown.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map((appt) => {
            const m = STATUS_META[appt.status] || STATUS_META.scheduled;
            const cancellable = ['scheduled', 'confirmed'].includes(appt.status) && new Date(appt.startsAt) > new Date();
            return (
              <div key={appt._id} className="appt-card">
                <div className="appt-card-head">
                  <strong>{appt.subject}</strong>
                  <span className="appt-status" style={{ background: m.color + '22', color: m.color }}>
                    {m.label}
                  </span>
                </div>
                <div className="appt-card-body">
                  <p>📅 <strong>{fmt(appt.startsAt)}</strong> → {fmt(appt.endsAt)}</p>
                  {appt.location && <p>📍 {appt.location}</p>}
                  {appt.description && <p className="muted">{appt.description}</p>}
                </div>
                {cancellable && (
                  <div className="appt-card-actions">
                    <button className="btn ghost danger small" onClick={() => cancel(appt)}>
                      ❌ Cancelar cita
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
