import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

const COLUMNS = [
  { key: 'pendiente', label: 'Pendiente', color: '#94a3b8' },
  { key: 'en_curso', label: 'En curso', color: '#FF6A00' },
  { key: 'hecho', label: 'Hecho', color: '#22c55e' },
];

const PRIORITY_COLORS = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e' };

// Category for generic documents — used to pick an icon + preview style
const DOC_ICONS = {
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  pdf: '📕',
  archive: '📦',
  code: '📄',
  doc: '📃',
  design: '🎨',
  font: '🔤',
  other: '📎',
};

// Returns the icon for a given mimetype + filename
function fileIcon(mimetype, filename) {
  const cat = categorizeFile(mimetype, filename);
  return DOC_ICONS[cat] || '📎';
}

function categorizeFile(mimetype, filename) {
  if (mimetype?.startsWith('image/')) return 'image';
  if (mimetype?.startsWith('video/')) return 'video';
  if (mimetype?.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  const ext = (filename?.split('.').pop() || '').toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (
    mimetype?.startsWith('text/') ||
    ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'yml', 'yaml',
     'md', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'sh', 'sql',
     'txt', 'csv', 'env', 'ini', 'toml', 'lock'].includes(ext)
  ) return 'code';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return 'doc';
  if (['psd', 'ai', 'fig', 'sketch', 'xd'].includes(ext)) return 'design';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return 'other';
}

const EMPTY = { title: '', description: '', status: 'pendiente', priority: 'media', dueDate: '', project: '', client: '', assignee: '' };

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

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null); // task being viewed in detail modal
  const [fProject, setFProject] = useState('');
  const [fClient, setFClient] = useState('');
  const [fPriority, setFPriority] = useState('');
  const openedTaskRef = useRef(null);

  async function load() {
    const params = new URLSearchParams();
    if (fProject) params.set('project', fProject);
    if (fClient) params.set('client', fClient);
    if (fPriority) params.set('priority', fPriority);
    const qs = params.toString();
    const [t, p, c] = await Promise.all([
      api.get(`/tasks${qs ? '?' + qs : ''}`),
      api.get('/dashboard/projects'),
      api.get('/clients'),
    ]);
    const prof = await api.get('/profile').catch(() => ({ data: { user: null } }));
    setTasks(t.data);
    setProjects(p.data);
    setClients(c.data);
    setMe(prof.data?.user || null);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fProject, fClient, fPriority]);

  // Auto-open detail modal if ?task=<id> is in the URL (e.g. coming from project detail)
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || tasks.length === 0) return;
    if (openedTaskRef.current === taskId) return; // already opened
    const found = tasks.find(t => t._id === taskId);
    if (found) {
      setDetail(found);
      openedTaskRef.current = taskId;
    }
  }, [tasks, searchParams]);

  function closeDetail() {
    setDetail(null);
    // Strip ?task from URL so refresh doesn't reopen
    if (searchParams.get('task')) {
      const next = new URLSearchParams(searchParams);
      next.delete('task');
      setSearchParams(next, { replace: true });
    }
    openedTaskRef.current = null;
  }

  function open(task = null) {
    setEditing(task ? task._id : 'new');
    setForm(task
      ? {
          ...task,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
          project: task.project?._id || task.project || '',
          client: task.client?._id || task.client || '',
          assignee: task.assignee?._id || task.assignee || '',
        }
      : EMPTY);
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        project: form.project || null,
        client: form.client || null,
        assignee: form.assignee || null,
      };
      if (!payload.dueDate) delete payload.dueDate;
      if (editing === 'new') await api.post('/tasks', payload);
      else await api.put(`/tasks/${editing}`, payload);
      setEditing(null);
      await load();
      if (detail && detail._id === editing) {
        const fresh = (await api.get('/tasks')).data.find((t) => t._id === editing);
        if (fresh) setDetail(fresh);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  }

  async function changeStatus(task, status) {
    await api.put(`/tasks/${task._id}`, { status });
    await load();
    if (detail?._id === task._id) {
      const fresh = (await api.get('/tasks')).data.find((t) => t._id === task._id);
      if (fresh) setDetail(fresh);
    }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar tarea?')) return;
    await api.delete(`/tasks/${id}`);
    if (detail?._id === id) closeDetail();
    load();
  }

  const grouped = COLUMNS.reduce((acc, c) => { acc[c.key] = tasks.filter((t) => t.status === c.key); return acc; }, {});

  return (
    <Layout>
      <header className="page-head">
        <div>
          <h1>Tareas</h1>
          <p className="muted">Tablero kanban · {tasks.length} tareas visibles</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select value={fProject} onChange={(e) => setFProject(e.target.value)} className="select-sm" title="Filtrar por proyecto">
            <option value="">📁 Todos los proyectos</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>
          <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="select-sm" title="Filtrar por cliente">
            <option value="">👤 Todos los clientes</option>
            {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="select-sm" title="Filtrar por prioridad">
            <option value="">🚦 Cualquier prioridad</option>
            <option value="alta">🔴 Alta</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🟢 Baja</option>
          </select>
          {(fProject || fClient || fPriority) && (
            <button onClick={() => { setFProject(''); setFClient(''); setFPriority(''); }} className="ghost small">✕ Limpiar</button>
          )}
          <button onClick={() => open()} className="primary">+ Nueva tarea</button>
        </div>
      </header>

      {editing && (
        <div className="modal-bg" style={{ zIndex: 110 }} onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editing === 'new' ? 'Nueva tarea' : 'Editar tarea'}</h3>
            {error && <div className="alert">{error}</div>}
            <Field label="Título *" v={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
            <Field label="Descripción" v={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />
            <div className="grid-2">
              <label>Estado
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label>Prioridad
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
              <label>Fecha límite
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>Proyecto
                <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value, assignee: '' })}>
                  <option value="">— Ninguno —</option>
                  {projects.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
                </select>
              </label>
            </div>
            <label>Cliente
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">— Ninguno —</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
            <label>Responsable
              {(() => {
                const proj = projects.find((p) => p._id === form.project);
                const memberOpts = [];
                if (proj) {
                  if (proj.owner) memberOpts.push({ _id: proj.owner._id, name: proj.owner.name, role: 'Dueño' });
                  (proj.members || []).forEach((m) => {
                    if (!memberOpts.some((o) => o._id === m.user._id)) {
                      memberOpts.push({ _id: m.user._id, name: m.user.name, role: m.role });
                    }
                  });
                }
                return (
                  <select
                    value={form.assignee}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    disabled={!proj}
                  >
                    <option value="">{proj ? '— Sin asignar —' : '— Selecciona un proyecto primero —'}</option>
                    {memberOpts.map((u) => (
                      <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                );
              })()}
              {form.project && (() => {
                const proj = projects.find((p) => p._id === form.project);
                const total = ((proj?.owner ? 1 : 0) + (proj?.members?.length || 0));
                return (
                  <small className="muted">
                    {total === 0 ? '⚠️ Este proyecto no tiene miembros — agrégalos en "Equipo"' : `Solo puedes asignar miembros del proyecto (${total} disponibles)`}
                  </small>
                );
              })()}
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <TaskDetail
          task={detail}
          me={me}
          onClose={closeDetail}
          onChanged={(t) => setDetail(t)}
          onEdit={() => {
            // Close the detail modal so the edit form is not behind it
            const d = detail;
            closeDetail();
            open(d);
          }}
          onStatusChange={(s) => changeStatus(detail, s)}
          onDelete={() => remove(detail._id)}
        />
      )}

      <div className="kanban">
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-col" style={{ borderTop: `3px solid ${col.color}` }}>
            <header>
              <strong>{col.label}</strong>
              <span className="count">{grouped[col.key].length}</span>
            </header>
            <div className="kanban-list">
              {grouped[col.key].length === 0 && <p className="muted small">Vacío</p>}
              {grouped[col.key].map((t) => (
                <article key={t._id} className="task-card" onClick={() => setDetail(t)}>
                  <div className="task-head">
                    <strong>{t.title}</strong>
                    <span className="prio" style={{ background: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                  </div>
                  {t.description && <p className="muted small">{t.description.slice(0, 80)}{t.description.length > 80 && '…'}</p>}
                  {(t.images?.length || t.videos?.length || t.comments?.length || t.links?.length) ? (
                    <div className="task-meta">
                      {t.images?.length > 0 && <span>🖼️ {t.images.length}</span>}
                      {t.videos?.length > 0 && <span>🎥 {t.videos.length}</span>}
                      {t.links?.length > 0 && <span>🔗 {t.links.length}</span>}
                      {t.comments?.length > 0 && <span>💬 {t.comments.length}</span>}
                    </div>
                  ) : null}
                  <div className="task-meta">
                    {t.project?.title && <span>📁 {t.project.title}</span>}
                    {t.client?.name && <span>👤 {t.client.name}</span>}
                    {t.dueDate && <span>📅 {new Date(t.dueDate).toLocaleDateString('es-MX')}</span>}
                    {t.assignee?.name && <span>🎯 {t.assignee.name}</span>}
                  </div>
                  <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                    {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                      <button key={c.key} className="ghost small" onClick={() => changeStatus(t, c.key)}>→ {c.label}</button>
                    ))}
                    <button className="ghost small danger" onClick={() => remove(t._id)}>×</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}

function Field({ label, v, onChange, type = 'text', required, textarea }) {
  return (
    <label>{label}
      {textarea
        ? <textarea value={v || ''} onChange={(e) => onChange(e.target.value)} rows={3} />
        : <input type={type} value={v || ''} onChange={(e) => onChange(e.target.value)} required={required} />}
    </label>
  );
}

function TaskDetail({ task, me, onClose, onChanged, onEdit, onStatusChange, onDelete }) {
  const [uploading, setUploading] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Links state
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [linkAdding, setLinkAdding] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const imgInput = useRef(null);
  const vidInput = useRef(null);
  const docInput = useRef(null);

  async function upload(kind, files) {
    if (!files?.length) return;
    setUploading(kind);
    setError('');
    setRejected([]);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const endpoint = kind === 'documents' ? `/tasks/${task._id}/documents` : `/tasks/${task._id}/${kind}`;
      // IMPORTANT: do NOT set Content-Type manually here. Axios sets the
      // correct `multipart/form-data; boundary=...` automatically when the body
      // is a FormData instance. Forcing it without the boundary makes the
      // backend multer unable to parse the parts (the "no files" / silent
      // failure you saw). Just send the FormData as-is.
      const { data } = await api.post(endpoint, fd);
      // /documents returns { task, rejected }
      if (kind === 'documents') {
        onChanged(data.task);
        if (data.rejected && data.rejected.length > 0) setRejected(data.rejected);
      } else {
        onChanged(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || `Error subiendo ${kind}`);
    } finally {
      setUploading(null);
      if (kind === 'images' && imgInput.current) imgInput.current.value = '';
      if (kind === 'videos' && vidInput.current) vidInput.current.value = '';
      if (kind === 'documents' && docInput.current) docInput.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) upload('documents', files);
  }

  async function removeFile(kind, fileId) {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
      const { data } = await api.delete(`/tasks/${task._id}/files/${kind}/${fileId}`);
      onChanged(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar');
    }
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setError('');
    try {
      const { data } = await api.post(`/tasks/${task._id}/comments`, { text: commentText });
      setCommentText('');
      onChanged(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al comentar');
    }
  }

  async function removeComment(commentId) {
    if (!confirm('¿Eliminar este comentario?')) return;
    try {
      const { data } = await api.delete(`/tasks/${task._id}/comments/${commentId}`);
      onChanged(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar comentario');
    }
  }

  // === Links ===
  function resetLinkForm() {
    setLinkUrl('');
    setLinkTitle('');
    setLinkDesc('');
    setShowLinkForm(false);
  }

  async function addLink(e) {
    e?.preventDefault();
    if (!linkUrl.trim()) return;
    setLinkAdding(true);
    setError('');
    try {
      const payload = { url: linkUrl.trim() };
      if (linkTitle.trim()) payload.title = linkTitle.trim();
      if (linkDesc.trim()) payload.description = linkDesc.trim();
      const { data } = await api.post(`/tasks/${task._id}/links`, payload);
      onChanged(data);
      resetLinkForm();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al agregar enlace');
    } finally {
      setLinkAdding(false);
    }
  }

  async function removeLink(linkId) {
    if (!confirm('¿Eliminar este enlace?')) return;
    try {
      const { data } = await api.delete(`/tasks/${task._id}/links/${linkId}`);
      onChanged(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar enlace');
    }
  }

  // Derive a clean hostname for display
  function linkHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-head">
          <div>
            <h3 style={{ marginBottom: 4 }}>{task.title}</h3>
            <div className="task-meta">
              <span className="prio" style={{ background: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
              {task.project?.title && <span>📁 {task.project.title}</span>}
              {task.client?.name && <span>👤 {task.client.name}</span>}
              {task.assignee?.name && <span>🎯 {task.assignee.name}</span>}
              {task.dueDate && <span>📅 {new Date(task.dueDate).toLocaleDateString('es-MX')}</span>}
            </div>
          </div>
          <div className="task-actions" onClick={(e) => e.stopPropagation()}>
            {COLUMNS.filter((c) => c.key !== task.status).map((c) => (
              <button key={c.key} className="ghost small" onClick={() => onStatusChange(c.key)}>→ {c.label}</button>
            ))}
            <button className="ghost small" onClick={onEdit}>Editar</button>
            <button className="ghost small danger" onClick={onDelete}>Eliminar</button>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {task.description && (
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{task.description}</p>
        )}

        <section className="task-section">
          <header>
            <h4>🖼️ Imágenes ({task.images?.length || 0})</h4>
            <div>
              <input
                ref={imgInput}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); upload('images', e.target.files); }}
              />
              <button
                className="ghost small"
                disabled={uploading === 'images'}
                onClick={(e) => { e.stopPropagation(); imgInput.current?.click(); }}
              >
                {uploading === 'images' ? 'Subiendo…' : '+ Subir'}
              </button>
            </div>
          </header>
          {(!task.images || task.images.length === 0) ? (
            <p className="muted small">Aún no hay imágenes. Adjunta capturas, mockups, fotos…</p>
          ) : (
            <div className="media-grid">
              {task.images.map((img) => (
                <div key={img._id} className="media-item">
                  <a href={img.url} target="_blank" rel="noreferrer">
                    <img src={img.url} alt={img.filename} />
                  </a>
                  <div className="media-foot">
                    <span className="muted small" title={img.filename}>{img.filename}</span>
                    <button className="ghost small danger" onClick={() => removeFile('images', img._id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="task-section">
          <header>
            <h4>🎥 Videos ({task.videos?.length || 0})</h4>
            <div>
              <input
                ref={vidInput}
                type="file"
                accept="video/*"
                multiple
                style={{ display: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); upload('videos', e.target.files); }}
              />
              <button
                className="ghost small"
                disabled={uploading === 'videos'}
                onClick={(e) => { e.stopPropagation(); vidInput.current?.click(); }}
              >
                {uploading === 'videos' ? 'Subiendo…' : '+ Subir'}
              </button>
            </div>
          </header>
          {(!task.videos || task.videos.length === 0) ? (
            <p className="muted small">Sin videos. Adjunta screen recordings, demos, reels…</p>
          ) : (
            <div className="media-list">
              {task.videos.map((v) => (
                <div key={v._id} className="video-item">
                  <video src={v.url} controls preload="metadata" />
                  <div className="media-foot">
                    <div>
                      <span className="muted small">{v.filename}</span>
                      <span className="muted small"> · {fmtSize(v.size)}</span>
                    </div>
                    <button className="ghost small danger" onClick={() => removeFile('videos', v._id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="task-section">
          <header>
            <h4>📎 Documentos y archivos ({task.documents?.length || 0})</h4>
            <div>
              <input
                ref={docInput}
                type="file"
                multiple
                style={{ display: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); upload('documents', e.target.files); }}
              />
              <button
                className="ghost small"
                disabled={uploading === 'documents'}
                onClick={(e) => { e.stopPropagation(); docInput.current?.click(); }}
              >
                {uploading === 'documents' ? 'Subiendo…' : '+ Subir archivos'}
              </button>
            </div>
          </header>

          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={(e) => { e.stopPropagation(); docInput.current?.click(); }}
            role="button"
            tabIndex={0}
          >
            <span className="drop-zone-icon">📂</span>
            <span>Arrastra cualquier archivo aquí, o haz click para seleccionar</span>
            <small className="muted">
              .js, .html, .pdf, .docx, .xlsx, .pptx, .zip, .json, código fuente… (máx. 50 MB)
            </small>
          </div>

          {rejected.length > 0 && (
            <div className="alert alert-warn" style={{ marginTop: 8 }}>
              <strong>⚠️ {rejected.length} archivo(s) rechazado(s):</strong>
              <ul style={{ margin: '4px 0 0 16px' }}>
                {rejected.map((r, i) => (
                  <li key={i}><code>{r.filename}</code>: {r.error}</li>
                ))}
              </ul>
            </div>
          )}

          {(!task.documents || task.documents.length === 0) ? (
            <p className="muted small" style={{ marginTop: 8 }}>
              Sin documentos. Sube planos, contratos, código, mockups, ZIPs, lo que necesites.
            </p>
          ) : (
            <ul className="doc-list">
              {task.documents.map((d) => {
                const cat = categorizeFile(d.mimetype, d.filename);
                return (
                  <li key={d._id} className={`doc-item doc-${cat}`}>
                    <div className="doc-icon">{fileIcon(d.mimetype, d.filename)}</div>
                    <div className="doc-body">
                      <div className="doc-name" title={d.filename}>{d.filename}</div>
                      <div className="doc-meta muted small">
                        {fmtSize(d.size)} · subido por {d.uploadedBy?.name || d.uploadedBy?.email || 'alguien'}
                      </div>
                    </div>
                    <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                      {(cat === 'pdf' || cat === 'code' || cat === 'image' || cat === 'video' || cat === 'audio') && (
                        <button
                          className="ghost small"
                          onClick={() => setPreviewDoc(d)}
                          title="Vista previa"
                        >
                          👁️
                        </button>
                      )}
                      <a
                        className="ghost small"
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        download={d.filename}
                        title="Descargar"
                      >
                        ⬇
                      </a>
                      <button
                        className="ghost small danger"
                        onClick={() => removeFile('documents', d._id)}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="task-section">
          <header>
            <h4>🔗 Enlaces ({task.links?.length || 0})</h4>
            <div>
              {!showLinkForm && (
                <button className="ghost small" onClick={() => setShowLinkForm(true)}>
                  + Agregar enlace
                </button>
              )}
            </div>
          </header>

          {showLinkForm && (
            <form onSubmit={addLink} className="link-form" style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '0.85em', color: 'var(--muted)' }}>URL * (http:// o https://)</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/..."
                required
                autoFocus
              />
              <label style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Título (opcional)</label>
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Ej. Mockup en Figma"
                maxLength={200}
              />
              <label style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Descripción (opcional)</label>
              <textarea
                value={linkDesc}
                onChange={(e) => setLinkDesc(e.target.value)}
                placeholder="¿Qué hay en este enlace?"
                maxLength={500}
                rows={2}
              />
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="ghost small" onClick={resetLinkForm} disabled={linkAdding}>Cancelar</button>
                <button type="submit" className="primary small" disabled={!linkUrl.trim() || linkAdding}>
                  {linkAdding ? 'Agregando…' : 'Guardar enlace'}
                </button>
              </div>
            </form>
          )}

          {(!task.links || task.links.length === 0) ? (
            <p className="muted small" style={{ marginTop: 8 }}>
              Sin enlaces. Agrega links a Figma, Google Docs, dashboards, Notion, Loom, lo que sea.
            </p>
          ) : (
            <ul className="link-list" style={{ marginTop: 8, listStyle: 'none', padding: 0 }}>
              {task.links.map((l) => (
                <li key={l._id} className="link-item" style={{ display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid var(--border, #2a2a2a)', borderRadius: 8, marginBottom: 6, background: 'var(--bg-2, #181818)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: '#FF6A00', textDecoration: 'none', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={l.url}
                    >
                      🔗 {l.title || l.url}
                    </a>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      <span style={{ opacity: 0.7 }}>{linkHostname(l.url)}</span>
                      {l.addedBy?.name && <span> · agregado por {l.addedBy.name}</span>}
                    </div>
                    {l.description && (
                      <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9em' }}>{l.description}</p>
                    )}
                  </div>
                  <button
                    className="ghost small danger"
                    onClick={() => removeLink(l._id)}
                    title="Eliminar enlace"
                    style={{ flexShrink: 0 }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="task-section">
          <header><h4>💬 Comentarios ({task.comments?.length || 0})</h4></header>
          <form onSubmit={sendComment} className="comment-form">
            <textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escribe un comentario…"
            />
            <button type="submit" className="primary" disabled={!commentText.trim()}>Comentar</button>
          </form>
          {(!task.comments || task.comments.length === 0) ? (
            <p className="muted small">Aún no hay comentarios.</p>
          ) : (
            <ul className="comment-list">
              {task.comments.map((c) => {
                const author = c.author?.name || c.author?.email || 'Alguien';
                const canDelete = me && (c.author?._id === me._id || task.owner?._id === me._id);
                return (
                  <li key={c._id} className="comment-item">
                    <div className="avatar-sm" style={{ background: '#FF6A00' }}>{(author[0] || '?').toUpperCase()}</div>
                    <div className="comment-body">
                      <div className="comment-meta">
                        <strong>{author}</strong>
                        <span className="muted small">{timeAgo(c.createdAt)}</span>
                      </div>
                      <p>{c.text}</p>
                    </div>
                    {canDelete && (
                      <button className="ghost small danger" onClick={() => removeComment(c._id)}>×</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {previewDoc && <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}

// === Preview modal for documents ===
function DocPreview({ doc, onClose }) {
  const cat = categorizeFile(doc.mimetype, doc.filename);
  const [text, setText] = useState(null);
  const [textError, setTextError] = useState('');

  // Load text content for code/text files
  useEffect(() => {
    if (cat !== 'code' && cat !== 'doc' && cat !== 'other') return;
    const ext = (doc.filename?.split('.').pop() || '').toLowerCase();
    if (['zip', 'rar', '7z', 'tar', 'gz', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav'].includes(ext)) return;
    api.get(doc.url, { responseType: 'text', transformResponse: [(d) => d] })
      .then((r) => setText(typeof r.data === 'string' ? r.data : ''))
      .catch((err) => setTextError(err.message || 'No se pudo leer el archivo'));
  }, [doc.url, cat]);

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 100 }}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
        <div className="task-detail-head">
          <div>
            <h3 style={{ marginBottom: 4 }}>
              {fileIcon(doc.mimetype, doc.filename)} {doc.filename}
            </h3>
            <div className="task-meta muted small">
              {doc.mimetype} · {fmtSize(doc.size)}
            </div>
          </div>
          <div className="task-actions">
            <a className="ghost small" href={doc.url} download={doc.filename} target="_blank" rel="noreferrer">⬇ Descargar</a>
            <button className="ghost small" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div className="doc-preview">
          {cat === 'image' && (
            <img src={doc.url} alt={doc.filename} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          )}
          {cat === 'video' && (
            <video src={doc.url} controls style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          )}
          {cat === 'audio' && (
            <audio src={doc.url} controls style={{ width: '100%' }} />
          )}
          {cat === 'pdf' && (
            <iframe
              src={doc.url}
              title={doc.filename}
              style={{ width: '100%', height: '70vh', border: 'none', background: '#1a1a1a' }}
            />
          )}
          {(cat === 'code' || cat === 'doc' || cat === 'other') && (
            <pre className="code-preview">
              {textError
                ? <span style={{ color: '#ef4444' }}>{textError}</span>
                : (text === null ? 'Cargando…' : text)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
