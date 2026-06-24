import { useEffect, useState, useMemo } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const STATUS_META = {
  scheduled: { color: '#0ea5e9', label: '📅 Agendada' },
  confirmed: { color: '#10b981', label: '✓ Confirmada' },
  completed: { color: '#6b7280', label: '✔ Completada' },
  cancelled: { color: '#ef4444', label: '✕ Cancelada' },
  no_show:   { color: '#f59e0b', label: '⚠ No asistió' },
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export default function Appointments() {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('calendar'); // 'calendar' | 'list'
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState(null); // date selected on calendar
  const [editing, setEditing] = useState(null);   // appointment being edited
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/appointments/public/staff').then((r) => setStaff(r.data || [])).catch(() => setStaff([]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterStaff) params.assignedTo = filterStaff;
      // Range: full month +/- a buffer
      const start = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      const end = endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0));
      params.from = start.toISOString();
      params.to = end.toISOString();
      const r = await api.get('/appointments', { params });
      setItems(r.data || []);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cursor, filterStatus, filterStaff]);

  // Build the calendar grid for the cursor month
  const calendarDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    // Pad to full weeks
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // Index items by yyyy-mm-dd
  const itemsByDay = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = new Date(it.startsAt).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [items]);

  const selectedItems = useMemo(() => {
    if (!selected) return [];
    const key = startOfDay(selected).toISOString().slice(0, 10);
    return itemsByDay.get(key) || [];
  }, [selected, itemsByDay]);

  function showToast(text, type = 'success') {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function changeStatus(appt, status) {
    try {
      await api.patch(`/appointments/${appt._id}`, { status });
      showToast(`Cita ${status === 'cancelled' ? 'cancelada' : 'actualizada'}`);
      await load();
      if (editing && String(editing._id) === String(appt._id)) {
        setEditing({ ...editing, status });
      }
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Error al actualizar', 'error');
    }
  }

  async function saveNotes(appt) {
    try {
      await api.patch(`/appointments/${appt._id}`, { staffNotes: editing.staffNotes });
      showToast('Notas guardadas');
      await load();
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Error al guardar', 'error');
    }
  }

  async function deleteAppt(appt) {
    if (!confirm(`¿Eliminar la cita de ${appt.customerName}?`)) return;
    try {
      await api.delete(`/appointments/${appt._id}`);
      showToast('Cita eliminada');
      setEditing(null);
      await load();
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Error al eliminar', 'error');
    }
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>📅 Citas</h1>
            <p className="muted">
              {items.length} cita(s) en este periodo
              {filterStatus || filterStaff ? ' (filtrado)' : ''}
            </p>
          </div>
          <div className="actions">
            <button className={`btn ${view === 'calendar' ? 'primary' : 'ghost'}`} onClick={() => setView('calendar')}>
              📅 Calendario
            </button>
            <button className={`btn ${view === 'list' ? 'primary' : 'ghost'}`} onClick={() => setView('list')}>
              📋 Lista
            </button>
            <button className="btn primary" onClick={() => setShowForm(true)}>
              ＋ Nueva cita
            </button>
          </div>
        </div>

        <div className="filters">
          <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select className="input" value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}>
            <option value="">Todos los asignados</option>
            {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          {(filterStatus || filterStaff) && (
            <button className="btn ghost small" onClick={() => { setFilterStatus(''); setFilterStaff(''); }}>
              ✕ Limpiar
            </button>
          )}
        </div>

        {view === 'calendar' && (
          <div className="appt-calendar">
            <div className="calendar-toolbar">
              <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                ←
              </button>
              <strong className="calendar-title">
                {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
              </strong>
              <button className="btn ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                →
              </button>
              <button className="btn ghost small" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>
                Hoy
              </button>
            </div>
            <div className="calendar-grid">
              {WEEKDAYS.map((d) => <div key={d} className="cal-weekday">{d}</div>)}
              {calendarDays.map((d, i) => {
                if (!d) return <div key={`pad-${i}`} className="cal-day empty" />;
                const key = startOfDay(d).toISOString().slice(0, 10);
                const dayItems = itemsByDay.get(key) || [];
                const isToday = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
                const isSelected = selected && startOfDay(d).getTime() === startOfDay(selected).getTime();
                return (
                  <button
                    key={key}
                    className={`cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelected(d)}
                  >
                    <span className="cal-day-num">{d.getDate()}</span>
                    <div className="cal-day-dots">
                      {dayItems.slice(0, 4).map((it) => {
                        const m = STATUS_META[it.status] || STATUS_META.scheduled;
                        return <span key={it._id} className="cal-dot" style={{ background: m.color }} title={it.subject} />;
                      })}
                      {dayItems.length > 4 && <span className="cal-more">+{dayItems.length - 4}</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="appt-day-list">
                <h3>📅 {selected.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                {selectedItems.length === 0 && <p className="muted">Sin citas ese día.</p>}
                {selectedItems.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map((appt) => {
                  const m = STATUS_META[appt.status] || STATUS_META.scheduled;
                  return (
                    <div key={appt._id} className="appt-row" onClick={() => setEditing(appt)}>
                      <div className="appt-time">
                        <strong>{fmtTime(appt.startsAt)}</strong>
                        <span className="muted small">{appt.durationMin || 30} min</span>
                      </div>
                      <div className="appt-info">
                        <strong>{appt.customerName}</strong>
                        <span>{appt.subject}</span>
                        {appt.assignedToName && <span className="muted small">→ {appt.assignedToName}</span>}
                      </div>
                      <span className="appt-status" style={{ background: m.color + '22', color: m.color }}>
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'list' && (
          <div className="appt-list">
            {loading && <div className="muted center pad">⏳ Cargando…</div>}
            {!loading && items.length === 0 && (
              <div className="empty">
                <span style={{ fontSize: 60 }}>📅</span>
                <h3>Sin citas</h3>
                <p className="muted">Las citas agendadas desde el landing page aparecerán aquí.</p>
              </div>
            )}
            {items.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map((appt) => {
              const m = STATUS_META[appt.status] || STATUS_META.scheduled;
              return (
                <div key={appt._id} className="appt-row" onClick={() => setEditing(appt)}>
                  <div className="appt-time">
                    <strong>{fmtDate(appt.startsAt)}</strong>
                    <span className="muted small">{appt.durationMin || 30} min</span>
                  </div>
                  <div className="appt-info">
                    <strong>{appt.customerName}</strong>
                    <span>{appt.subject}</span>
                    {appt.assignedToName && <span className="muted small">→ {appt.assignedToName}</span>}
                  </div>
                  <span className="appt-status" style={{ background: m.color + '22', color: m.color }}>
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* edit modal */}
        {editing && (
          <div className="modal-backdrop" onClick={() => setEditing(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <h2>📅 {editing.subject}</h2>
                <button className="close" onClick={() => setEditing(null)}>×</button>
              </header>
              <div className="form">
                <div className="appt-detail">
                  <div>
                    <span className="muted small">Cliente</span>
                    <strong>{editing.customerName}</strong>
                  </div>
                  {editing.customerEmail && (
                    <div>
                      <span className="muted small">Email</span>
                      <a href={`mailto:${editing.customerEmail}`}>{editing.customerEmail}</a>
                    </div>
                  )}
                  {editing.customerPhone && (
                    <div>
                      <span className="muted small">Teléfono</span>
                      <a href={`tel:${editing.customerPhone}`}>{editing.customerPhone}</a>
                    </div>
                  )}
                  <div>
                    <span className="muted small">Cuándo</span>
                    <strong>{fmtDate(editing.startsAt)}</strong>
                    <span className="muted small"> → {fmtDate(editing.endsAt)}</span>
                  </div>
                  <div>
                    <span className="muted small">Asignado a</span>
                    <strong>{editing.assignedTo?.name || editing.assignedToName || 'Sin asignar'}</strong>
                  </div>
                  {editing.location && (
                    <div>
                      <span className="muted small">Lugar</span>
                      <span>{editing.location}</span>
                    </div>
                  )}
                  {editing.description && (
                    <div>
                      <span className="muted small">Descripción del cliente</span>
                      <p>{editing.description}</p>
                    </div>
                  )}
                </div>

                <label>
                  Estado
                  <select
                    className="input"
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  >
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Notas del equipo
                  <textarea
                    className="input"
                    rows={4}
                    value={editing.staffNotes || ''}
                    onChange={(e) => setEditing({ ...editing, staffNotes: e.target.value })}
                    placeholder="Resultado de la cita, acuerdos, seguimiento…"
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn danger" onClick={() => deleteAppt(editing)}>
                    🗑 Eliminar
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                    Cerrar
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      await api.patch(`/appointments/${editing._id}`, {
                        status: editing.status,
                        staffNotes: editing.staffNotes,
                      });
                      showToast('Cita guardada');
                      setEditing(null);
                      await load();
                    }}
                  >
                    💾 Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* create modal (admin manual) */}
        {showForm && (
          <CreateApptModal
            staff={staff}
            onClose={() => setShowForm(false)}
            onCreated={() => { setShowForm(false); showToast('Cita creada'); load(); }}
          />
        )}

        {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}
      </div>
    </Layout>
  );
}

function CreateApptModal({ staff, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!name.trim()) return setError('Nombre requerido');
    if (!subject.trim()) return setError('Asunto requerido');
    if (!date || !startTime) return setError('Fecha y hora requeridas');
    setBusy(true);
    try {
      const startsAt = new Date(`${date}T${startTime}:00`);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      await api.post('/appointments', {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        subject,
        description,
        assignedTo: assignedTo || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: 'Manual',
      });
      onCreated();
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error al crear');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>＋ Nueva cita manual</h2>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="form">
          {error && <div className="banner error">{error}</div>}
          <div className="row two">
            <label>
              Nombre del cliente *
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <div className="row two">
            <label>
              Teléfono
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Asignado a
              <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Sin asignar</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <label>
            Asunto *
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            Descripción
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="row two">
            <label>
              Fecha *
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Hora de inicio
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} step="900" />
            </label>
          </div>
          <label>
            Duración (min)
            <select className="input" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hora</option>
              <option value={90}>1.5 horas</option>
              <option value={120}>2 horas</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn primary" onClick={submit} disabled={busy}>
              {busy ? '⏳ Guardando…' : '✨ Crear cita'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
