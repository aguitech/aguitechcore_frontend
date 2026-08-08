import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

// ─────────────────────────────────────────────────────────────────
// INCIDENTS PAGE — sibling of Tasks.
//
// Functionally the same UI shape (list + filters + kanban + modal
// detail + attachments + comments + links) but with incident-specific
// semantics: severity/SLA, 4-stage status flow, type categorization,
// post-mortem fields (resolution/rootCause/prevention), and affected
// tasks references.
//
// The component intentionally reuses the same UX patterns as Tasks
// so users who know Tasks feel at home immediately.
// ─────────────────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  { key: 'abierta',     label: '🔴 Abierta',     color: '#ef4444' },
  { key: 'en_atencion', label: '🟡 En atención', color: '#f59e0b' },
  { key: 'resuelta',    label: '🟢 Resuelta',    color: '#10b981' },
  { key: 'cerrada',     label: '⚫ Cerrada',     color: '#6b7280' },
];

const SEVERITY_OPTIONS = [
  { value: 'S1', label: '🔴 S1 — Crítica',  sla: '15min respuesta · 4h resolución',   color: '#ef4444' },
  { value: 'S2', label: '🟠 S2 — Alta',     sla: '30min respuesta · 8h resolución',   color: '#f97316' },
  { value: 'S3', label: '🟡 S3 — Media',    sla: '2h respuesta · 24h resolución',     color: '#eab308' },
  { value: 'S4', label: '🟢 S4 — Baja',     sla: '8h respuesta · 72h resolución',     color: '#22c55e' },
];

const TYPE_OPTIONS = [
  { value: 'bug',         label: '🐞 Bug' },
  { value: 'caida',       label: '💥 Caída' },
  { value: 'seguridad',   label: '🔒 Seguridad' },
  { value: 'rendimiento', label: '⚡ Rendimiento' },
  { value: 'datos',       label: '📊 Datos' },
  { value: 'ux',          label: '🎨 UX' },
  { value: 'otro',        label: '📦 Otro' },
];

const DOC_ICONS = {
  image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕',
  archive: '📦', code: '📄', doc: '📃', design: '🎨', font: '🔤', other: '📎',
};

function fileIcon(mimetype, filename) {
  if (mimetype?.startsWith('image/')) return DOC_ICONS.image;
  if (mimetype?.startsWith('video/')) return DOC_ICONS.video;
  if (mimetype?.startsWith('audio/')) return DOC_ICONS.audio;
  if (mimetype === 'application/pdf') return DOC_ICONS.pdf;
  const ext = (filename?.split('.').pop() || '').toLowerCase();
  if (['zip','rar','7z','tar','gz'].includes(ext)) return DOC_ICONS.archive;
  if (['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp'].includes(ext)) return DOC_ICONS.doc;
  if (['psd','ai','fig','sketch','xd'].includes(ext)) return DOC_ICONS.design;
  if (['ttf','otf','woff','woff2'].includes(ext)) return DOC_ICONS.font;
  return DOC_ICONS.other;
}

const EMPTY = {
  title: '', description: '', status: 'abierta', severity: 'S3',
  type: 'bug', project: '', client: '', assignee: '', impact: '',
  affectedTasks: [],
};

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-MX');
}

// "hace 2h 13min" / "vence en 1h 45min" / "vencido hace 30min"
function timeDelta(iso, future = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const overdue = future ? diff < 0 : diff > 0;
  let label;
  if (abs < 60) label = `${Math.floor(abs)}s`;
  else if (abs < 3600) label = `${Math.floor(abs / 60)}min`;
  else if (abs < 86400) label = `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}min`;
  else label = `${Math.floor(abs / 86400)}d ${Math.floor((abs % 86400) / 3600)}h`;
  return overdue ? `${label} vencido` : label;
}

function slaLabel(sla) {
  if (!sla) return null;
  const { status, minutesToBreach } = sla;
  if (status === 'breached') return { text: '⛔ SLA VENCIDO', cls: 'sla-breached' };
  if (status === 'response_overdue') return { text: '⚠️ Sin respuesta', cls: 'sla-response-overdue' };
  if (minutesToBreach < 60) return { text: `🔥 ${timeDelta(sla.resolveDueAt, true)}`, cls: 'sla-urgent' };
  if (minutesToBreach < 240) return { text: `⏳ ${timeDelta(sla.resolveDueAt, true)}`, cls: 'sla-warning' };
  return null;
}

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);   // null | 'new' | incidentObj
  const [form, setForm] = useState(EMPTY);

  // Filters
  const [fStatus, setFStatus] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fType, setFType] = useState('');
  const [fMine, setFMine] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fStatus) params.set('status', fStatus);
      if (fSeverity) params.set('severity', fSeverity);
      if (fType) params.set('type', fType);
      if (fMine) params.set('mine', 'true');
      if (search.trim()) params.set('search', search.trim());

      const [inc, prof, proj, cli, usr, tks] = await Promise.all([
        api.get(`/incidents?${params}`),
        api.get('/profile'),
        api.get('/projects').catch(() => ({ data: [] })),
        api.get('/clients').catch(() => ({ data: [] })),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setIncidents(inc.data);
      setMe(prof.data.user);
      setProjects(proj.data);
      setClients(cli.data);
      setUsers(usr.data);
      setAllTasks(tks.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fStatus, fSeverity, fType, fMine]);

  // Group incidents by status for the kanban view (default)
  const grouped = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = incidents.filter((i) => i.status === col.key);
    return acc;
  }, {});

  // Stats
  const stats = {
    total: incidents.length,
    abierta: incidents.filter((i) => i.status === 'abierta').length,
    en_atencion: incidents.filter((i) => i.status === 'en_atencion').length,
    resuelta: incidents.filter((i) => i.status === 'resuelta').length,
    cerrada: incidents.filter((i) => i.status === 'cerrada').length,
    slaBreached: incidents.filter((i) => i.sla?.breached).length,
    s1: incidents.filter((i) => i.severity === 'S1').length,
    s2: incidents.filter((i) => i.severity === 'S2').length,
  };

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
  }

  function openEdit(inc) {
    setForm({
      title: inc.title,
      description: inc.description || '',
      status: inc.status,
      severity: inc.severity,
      type: inc.type,
      project: inc.project?._id || '',
      client: inc.client?._id || '',
      assignee: inc.assignee?._id || '',
      impact: inc.impact || '',
      affectedTasks: (inc.affectedTasks || []).map((t) => t._id || t),
    });
    setEditing(inc);
    setDetail(null);
  }

  async function saveForm(e) {
    e?.preventDefault?.();
    setError('');
    if (!form.title.trim()) return setError('El título es obligatorio');
    const body = {
      title: form.title.trim(),
      description: form.description,
      status: form.status,
      severity: form.severity,
      type: form.type,
      project: form.project || null,
      client: form.client || null,
      assignee: form.assignee || null,
      impact: form.impact,
      affectedTasks: form.affectedTasks || [],
    };
    try {
      if (editing === 'new') {
        await api.post('/incidents', body);
      } else if (editing) {
        await api.put(`/incidents/${editing._id}`, body);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al guardar');
    }
  }

  async function deleteInc(inc) {
    if (!confirm(`¿Eliminar la incidencia "${inc.title}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/incidents/${inc._id}`);
      setDetail(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Error al eliminar');
    }
  }

  async function quickStatus(inc, newStatus) {
    try {
      await api.put(`/incidents/${inc._id}`, { status: newStatus });
      await load();
      if (detail?._id === inc._id) setDetail({ ...inc, status: newStatus });
    } catch (e) {
      alert(e.response?.data?.message || 'Error al cambiar estado');
    }
  }

  return (
    <Layout>
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>🚨 Incidencias</h1>
            <p className="muted">
              {stats.total} en total · {stats.abierta} abiertas · {stats.en_atencion} en atención ·{' '}
              {stats.slaBreached > 0 && <strong style={{ color: '#ef4444' }}>{stats.slaBreached} con SLA vencido</strong>}
              {stats.slaBreached === 0 && stats.total > 0 && <span style={{ color: '#22c55e' }}>✓ SLA en verde</span>}
            </p>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={openNew}>+ Nueva incidencia</button>
          </div>
        </div>

        {/* SLA-breach banner */}
        {stats.slaBreached > 0 && (
          <div className="banner error" style={{ marginBottom: '1rem' }}>
            ⛔ <strong>{stats.slaBreached} incidencia(s) con SLA vencido.</strong> Atiéndelas ahora.
          </div>
        )}

        {/* Stat tiles */}
        <div className="stats-tiles" style={{ marginBottom: '1rem' }}>
          <div className="stat-tile">
            <span className="stat-label">Total</span>
            <strong className="stat-value">{stats.total}</strong>
          </div>
          <div className="stat-tile" style={{ borderLeft: '4px solid #ef4444' }}>
            <span className="stat-label">🔴 S1 Críticas</span>
            <strong className="stat-value">{stats.s1}</strong>
          </div>
          <div className="stat-tile" style={{ borderLeft: '4px solid #f97316' }}>
            <span className="stat-label">🟠 S2 Altas</span>
            <strong className="stat-value">{stats.s2}</strong>
          </div>
          <div className="stat-tile" style={{ borderLeft: '4px solid #10b981' }}>
            <span className="stat-label">✅ Resueltas</span>
            <strong className="stat-value">{stats.resuelta + stats.cerrada}</strong>
          </div>
        </div>

        {/* Filters */}
        <div className="filters" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Buscar por título o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {STATUS_COLUMNS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="input" value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}>
            <option value="">Todas las severidades</option>
            {SEVERITY_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="input" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            className={`btn small ${fMine ? 'primary' : 'ghost'}`}
            onClick={() => setFMine(!fMine)}
          >
            {fMine ? '✓ Solo mías' : 'Solo mías'}
          </button>
          <button className="btn ghost small" onClick={load}>🔄 Refrescar</button>
        </div>

        {error && <div className="alert">{error}</div>}

        {/* Kanban view */}
        {loading ? (
          <div className="muted center pad">⏳ Cargando incidencias…</div>
        ) : incidents.length === 0 ? (
          <div className="empty">
            <span style={{ fontSize: 60 }}>🎉</span>
            <h3>Sin incidencias</h3>
            <p className="muted">No hay incidencias que coincidan con los filtros. Buen momento para descansar.</p>
            <button className="btn primary" onClick={openNew}>Reportar la primera</button>
          </div>
        ) : (
          <div className="incident-kanban">
            {STATUS_COLUMNS.map((col) => (
              <div key={col.key} className="incident-col" style={{ borderTop: `3px solid ${col.color}` }}>
                <header className="incident-col-head">
                  <strong>{col.label}</strong>
                  <span className="muted small">{grouped[col.key]?.length || 0}</span>
                </header>
                <div className="incident-col-body">
                  {(grouped[col.key] || []).map((inc) => (
                    <IncidentCard
                      key={inc._id}
                      inc={inc}
                      me={me}
                      onOpen={() => setDetail(inc)}
                      onQuickStatus={(s) => quickStatus(inc, s)}
                      statusColumns={STATUS_COLUMNS}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / edit modal */}
        {editing && (
          <IncidentFormModal
            form={form}
            setForm={setForm}
            onClose={() => setEditing(null)}
            onSubmit={saveForm}
            error={error}
            projects={projects}
            clients={clients}
            users={users}
            allTasks={allTasks}
            isNew={editing === 'new'}
          />
        )}

        {/* Detail modal */}
        {detail && (
          <IncidentDetailModal
            incident={detail}
            me={me}
            users={users}
            allTasks={allTasks}
            onClose={() => setDetail(null)}
            onEdit={() => openEdit(detail)}
            onDelete={() => deleteInc(detail)}
            onQuickStatus={(s) => quickStatus(detail, s)}
            onChanged={() => load()}
          />
        )}
      </div>
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────
// IncidentCard — compact card shown in the kanban column.
// ─────────────────────────────────────────────────────────────────
function IncidentCard({ inc, onOpen, onQuickStatus, statusColumns }) {
  const sev = SEVERITY_OPTIONS.find((s) => s.value === inc.severity);
  const type = TYPE_OPTIONS.find((t) => t.value === inc.type);
  const sla = slaLabel(inc.sla);
  return (
    <article
      className="incident-card"
      onClick={onOpen}
      style={{ borderLeft: `4px solid ${sev?.color || '#94a3b8'}` }}
    >
      <header className="incident-card-head">
        <strong>{inc.title}</strong>
        <span className="badge" style={{ background: sev?.color }}>{inc.severity}</span>
      </header>
      <p className="muted small" style={{ margin: '4px 0' }}>
        {type?.label} · {timeAgo(inc.createdAt)}
      </p>
      {inc.description && (
        <p className="incident-card-desc">{inc.description.slice(0, 100)}{inc.description.length > 100 ? '…' : ''}</p>
      )}
      <footer className="incident-card-foot">
        <span className="muted small">
          {inc.assignee ? `👤 ${inc.assignee.name}` : '👤 Sin asignar'}
        </span>
        {sla && <span className={`sla-badge ${sla.cls}`}>{sla.text}</span>}
      </footer>
      {/* Quick status switcher — click to move */}
      <div className="incident-card-actions" onClick={(e) => e.stopPropagation()}>
        {statusColumns
          .filter((s) => s.key !== inc.status)
          .map((s) => (
            <button
              key={s.key}
              className="ghost xs"
              onClick={() => onQuickStatus(s.key)}
              title={`Mover a ${s.label}`}
            >
              → {s.label.split(' ').pop()}
            </button>
          ))}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────
// IncidentFormModal — create or edit an incident.
// ─────────────────────────────────────────────────────────────────
function IncidentFormModal({ form, setForm, onClose, onSubmit, error, projects, clients, users, allTasks, isNew }) {
  const set = (k, v) => setForm({ ...form, [k]: v });
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{isNew ? '🚨 Nueva incidencia' : '✏️ Editar incidencia'}</h2>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="form">
            {error && <div className="banner error">{error}</div>}

            <label>
              Título *
              <input
                className="input"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Ej: Login devuelve 500 desde 14:30"
                autoFocus
                required
              />
            </label>

            <label>
              Descripción
              <textarea
                className="input"
                rows={4}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Qué pasó, síntomas, contexto…"
              />
            </label>

            <div className="row two">
              <label>
                Severidad
                <select className="input" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label} — {s.sla}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            </div>

            <div className="row two">
              <label>
                Estado
                <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUS_COLUMNS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label>
                Asignado a
                <select className="input" value={form.assignee} onChange={(e) => set('assignee', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </label>
            </div>

            <div className="row two">
              <label>
                Proyecto
                <select className="input" value={form.project} onChange={(e) => set('project', e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
                </select>
              </label>
              <label>
                Cliente
                <select className="input" value={form.client} onChange={(e) => set('client', e.target.value)}>
                  <option value="">Sin cliente</option>
                  {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </label>
            </div>

            <label>
              Impacto
              <textarea
                className="input"
                rows={2}
                value={form.impact}
                onChange={(e) => set('impact', e.target.value)}
                placeholder="Ej: 200 clientes sin acceso al dashboard durante 2h"
              />
            </label>

            {/* Affected tasks — multi-select */}
            <label>
              Tareas afectadas (opcional)
              <div className="affected-tasks-pick" style={{
                border: '1px solid var(--border)', borderRadius: 6, padding: 8, maxHeight: 140, overflowY: 'auto',
                background: 'var(--bg-2, #181818)',
              }}>
                {allTasks.length === 0 && <span className="muted small">No hay tareas disponibles</span>}
                {allTasks.slice(0, 50).map((t) => {
                  const checked = (form.affectedTasks || []).includes(t._id);
                  return (
                    <label key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const list = form.affectedTasks || [];
                          set('affectedTasks', e.target.checked
                            ? [...list, t._id]
                            : list.filter((id) => id !== t._id));
                        }}
                      />
                      <span style={{ fontSize: '0.85rem' }}>{t.title}</span>
                      <span className="muted xs"> · {t.status}</span>
                    </label>
                  );
                })}
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary">{isNew ? '🚨 Crear incidencia' : '💾 Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// IncidentDetailModal — view + edit an incident with attachments,
// comments, links, and post-mortem fields (when applicable).
// ─────────────────────────────────────────────────────────────────
function IncidentDetailModal({ incident, me, users, allTasks, onClose, onEdit, onDelete, onQuickStatus, onChanged }) {
  const [data, setData] = useState(incident);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [linkForm, setLinkForm] = useState({ url: '', title: '', description: '' });

  async function reload() {
    const r = await api.get(`/incidents`);
    const found = r.data.find((x) => x._id === incident._id);
    if (found) setData(found);
    onChanged();
  }

  async function changeStatus(s) {
    setError('');
    try {
      await api.put(`/incidents/${incident._id}`, { status: s });
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function changeAssignee(uid) {
    setError('');
    try {
      await api.put(`/incidents/${incident._id}`, { assignee: uid || null });
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function saveResolution(field, value) {
    setError('');
    try {
      await api.put(`/incidents/${incident._id}`, { [field]: value });
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function uploadFiles(kind, fileList) {
    if (!fileList?.length) return;
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f);
    try {
      await api.post(`/incidents/${incident._id}/${kind}`, fd);
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al subir');
    }
  }

  async function deleteAttachment(kind, fileId) {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
      await api.delete(`/incidents/${incident._id}/files/${kind}/${fileId}`);
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function addLink(e) {
    e.preventDefault();
    if (!linkForm.url.trim()) return;
    try {
      await api.post(`/incidents/${incident._id}/links`, linkForm);
      setLinkForm({ url: '', title: '', description: '' });
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function deleteLink(linkId) {
    try {
      await api.delete(`/incidents/${incident._id}/links/${linkId}`);
      await reload();
    } catch (e) { setError(e.response?.data?.message || 'Error'); }
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await api.post(`/incidents/${incident._id}/comments`, { text: commentText });
      setCommentText('');
      await reload();
    } catch (e) {
      setError(e.response?.data?.message || 'Error');
    }
  }

  async function deleteComment(commentId) {
    if (!confirm('¿Eliminar este comentario?')) return;
    try {
      await api.delete(`/incidents/${incident._id}/comments/${commentId}`);
      await reload();
    } catch (e) { setError(e.response?.data?.message || 'Error'); }
  }

  const sev = SEVERITY_OPTIONS.find((s) => s.value === data.severity);
  const type = TYPE_OPTIONS.find((t) => t.value === data.type);
  const sla = slaLabel(data.sla);
  const allFiles = [
    ...(data.images || []).map((f) => ({ ...f, kind: 'image' })),
    ...(data.videos || []).map((f) => ({ ...f, kind: 'video' })),
    ...(data.documents || []).map((f) => ({ ...f, kind: 'document' })),
  ];

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal xlarge" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <header className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: '1.5em' }}>{type?.label.split(' ')[0]}</span>
            <h2 style={{ margin: 0 }}>{data.title}</h2>
            <span className="badge" style={{ background: sev?.color }}>{data.severity}</span>
            {sla && <span className={`sla-badge ${sla.cls}`}>{sla.text}</span>}
          </div>
          <div className="actions" style={{ display: 'flex', gap: 6 }}>
            <button className="ghost small" onClick={onEdit}>✏️ Editar</button>
            <button className="ghost small danger" onClick={onDelete}>🗑</button>
            <button className="close" onClick={onClose}>×</button>
          </div>
        </header>

        {error && <div className="banner error" style={{ margin: '0 1.5rem' }}>{error}</div>}

        <div className="form" style={{ padding: '1.5rem' }}>
          {/* Meta grid */}
          <div className="incident-meta-grid">
            <div>
              <span className="muted small">Estado</span>
              <select className="input small" value={data.status} onChange={(e) => changeStatus(e.target.value)}>
                {STATUS_COLUMNS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <span className="muted small">Asignado a</span>
              <select className="input small" value={data.assignee?._id || ''} onChange={(e) => changeAssignee(e.target.value)}>
                <option value="">Sin asignar</option>
                {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <span className="muted small">SLA respuesta</span>
              <strong>{data.sla?.responseDueAt ? new Date(data.sla.responseDueAt).toLocaleString('es-MX') : '—'}</strong>
            </div>
            <div>
              <span className="muted small">SLA resolución</span>
              <strong>{data.sla?.resolveDueAt ? new Date(data.sla.resolveDueAt).toLocaleString('es-MX') : '—'}</strong>
            </div>
            {data.project && <div><span className="muted small">Proyecto</span><strong>{data.project.title}</strong></div>}
            {data.client && <div><span className="muted small">Cliente</span><strong>{data.client.name}</strong></div>}
          </div>

          {/* Description */}
          <section style={{ marginTop: '1rem' }}>
            <h4>Descripción</h4>
            <p style={{ whiteSpace: 'pre-wrap' }}>{data.description || <span className="muted">—</span>}</p>
          </section>

          {/* Impact */}
          {data.impact && (
            <section style={{ marginTop: '1rem' }}>
              <h4>Impacto</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{data.impact}</p>
            </section>
          )}

          {/* Affected tasks */}
          {data.affectedTasks?.length > 0 && (
            <section style={{ marginTop: '1rem' }}>
              <h4>Tareas afectadas</h4>
              <ul>
                {data.affectedTasks.map((t) => <li key={t._id}>📋 {t.title} <span className="muted xs">({t.status})</span></li>)}
              </ul>
            </section>
          )}

          {/* Post-mortem — only when status is resuelta or cerrada */}
          {(data.status === 'resuelta' || data.status === 'cerrada') && (
            <section style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16,185,129,0.05)', borderRadius: 8 }}>
              <h4>📋 Post-mortem</h4>
              <label>
                Resolución
                <textarea
                  className="input"
                  rows={3}
                  defaultValue={data.resolution || ''}
                  onBlur={(e) => e.target.value !== (data.resolution || '') && saveResolution('resolution', e.target.value)}
                  placeholder="Qué se hizo para resolver…"
                />
              </label>
              <label>
                Causa raíz
                <textarea
                  className="input"
                  rows={2}
                  defaultValue={data.rootCause || ''}
                  onBlur={(e) => e.target.value !== (data.rootCause || '') && saveResolution('rootCause', e.target.value)}
                  placeholder="Por qué pasó…"
                />
              </label>
              <label>
                Prevención
                <textarea
                  className="input"
                  rows={2}
                  defaultValue={data.prevention || ''}
                  onBlur={(e) => e.target.value !== (data.prevention || '') && saveResolution('prevention', e.target.value)}
                  placeholder="Qué vamos a hacer para que no vuelva a pasar…"
                />
              </label>
              <p className="muted xs">Los cambios se guardan al perder foco (Tab o clic fuera).</p>
            </section>
          )}

          {/* Attachments */}
          <section style={{ marginTop: '1.5rem' }}>
            <h4>📎 Adjuntos ({allFiles.length})</h4>
            <input type="file" multiple onChange={(e) => uploadFiles(e.target.name, Array.from(e.target.files))} style={{ display: 'none' }} id="inc-image-input" accept="image/*" />
            <input type="file" multiple onChange={(e) => uploadFiles(e.target.name, Array.from(e.target.files))} style={{ display: 'none' }} id="inc-video-input" accept="video/*" />
            <input type="file" multiple onChange={(e) => uploadFiles(e.target.name, Array.from(e.target.files))} style={{ display: 'none' }} id="inc-doc-input" />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" className="ghost small" onClick={() => document.getElementById('inc-image-input').click()}>📷 Imágenes</button>
              <button type="button" className="ghost small" onClick={() => document.getElementById('inc-video-input').click()}>🎬 Videos</button>
              <button type="button" className="ghost small" onClick={() => document.getElementById('inc-doc-input').click()}>📄 Documentos</button>
            </div>
            {allFiles.length === 0 && <p className="muted small">Sin adjuntos</p>}
            <div className="file-list">
              {allFiles.map((f) => (
                <div key={f._id} className="file-row">
                  <span>{fileIcon(f.mimetype, f.filename)}</span>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.filename}</a>
                  <span className="muted xs">{fmtSize(f.size)}</span>
                  <button className="ghost xs danger" onClick={() => deleteAttachment(f.kind, f._id)}>×</button>
                </div>
              ))}
            </div>
          </section>

          {/* Links */}
          <section style={{ marginTop: '1.5rem' }}>
            <h4>🔗 Links externos</h4>
            {(data.links || []).map((l) => (
              <div key={l._id} className="file-row">
                <span>🔗</span>
                <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a>
                {l.description && <span className="muted xs">{l.description}</span>}
                <button className="ghost xs danger" onClick={() => deleteLink(l._id)}>×</button>
              </div>
            ))}
            <form onSubmit={addLink} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="input small" placeholder="URL" value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} required />
              <input className="input small" placeholder="Título (opcional)" value={linkForm.title} onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })} />
              <button type="submit" className="ghost small">+ Agregar</button>
            </form>
          </section>

          {/* Comments */}
          <section style={{ marginTop: '1.5rem' }}>
            <h4>💬 Comentarios ({(data.comments || []).length})</h4>
            {(data.comments || []).map((c) => (
              <div key={c._id} className="comment-row">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{c.author?.name || '—'}</strong>
                  <span className="muted xs">{timeAgo(c.createdAt)}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{c.text}</p>
                {(String(c.author?._id) === String(me?._id) || me?.role === 'admin') && (
                  <button className="ghost xs danger" onClick={() => deleteComment(c._id)}>Eliminar</button>
                )}
              </div>
            ))}
            <form onSubmit={addComment} style={{ marginTop: 8 }}>
              <textarea
                className="input"
                rows={2}
                placeholder="Escribe un comentario…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button type="submit" className="primary small" disabled={!commentText.trim()}>Enviar</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}