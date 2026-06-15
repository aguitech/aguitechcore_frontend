import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  async function load() {
    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const { data } = await api.get(`/calendar/events?from=${from}&to=${to}`);
    setEvents(data);
  }
  useEffect(() => { load(); }, [year, month]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // weekday: 0=Sun .. 6=Sat; queremos Lun=0
    const startWeekday = (first.getDay() + 6) % 7;
    const totalDays = last.getDate();
    const arr = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) arr.push(d);
    return arr;
  }, [year, month]);

  function eventsOnDay(d) {
    if (!d) return [];
    const day = new Date(year, month, d);
    return events.filter((e) => {
      const ed = new Date(e.date);
      return ed.getFullYear() === day.getFullYear() && ed.getMonth() === day.getMonth() && ed.getDate() === day.getDate();
    });
  }

  function prev() { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); }
  function next() { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); }

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Calendario</h1>
          <p className="muted">Tus tareas y deadlines del mes</p>
        </div>
        <div className="cal-nav">
          <button className="ghost" onClick={prev}>‹</button>
          <strong>{MONTHS[month]} {year}</strong>
          <button className="ghost" onClick={next}>›</button>
        </div>
      </header>

      <div className="card">
        <div className="cal-grid">
          {DAYS.map((d, i) => <div key={i} className="cal-head">{d}</div>)}
          {cells.map((d, i) => {
            const evs = eventsOnDay(d);
            const isToday = d && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            return (
              <button
                key={i}
                className={`cal-cell ${d ? '' : 'empty'} ${isToday ? 'today' : ''}`}
                disabled={!d}
                onClick={() => d && setSelected({ day: d, events: evs })}
              >
                {d && <span className="cal-num">{d}</span>}
                {d && evs.slice(0, 3).map((e) => (
                  <span key={e.id} className="cal-event" style={{ background: e.color }}>{e.title}</span>
                ))}
                {d && evs.length > 3 && <small className="muted">+{evs.length - 3} más</small>}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="modal-bg" onClick={() => setSelected(null)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Eventos del {selected.day} de {MONTHS[month]}</h3>
            {selected.events.length === 0
              ? <p className="muted">Nada agendado este día.</p>
              : selected.events.map((e) => (
                  <div key={e.id} className="event-row">
                    <span className="dot" style={{ background: e.color }} />
                    <div>
                      <strong>{e.title}</strong>
                      <small className="muted">{e.type} · {e.status}{e.priority && ` · prioridad ${e.priority}`}</small>
                    </div>
                  </div>
                ))}
            <div className="modal-actions">
              <button className="primary" onClick={() => setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
