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

const EMPTY = { title: '', description: '', status: 'pendiente', priority: 'media', dueDate: '', project: '', client: '' };

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
        }
      : EMPTY);
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, project: form.project || null, client: form.client || null };
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
        <div className="modal-bg" onClick={() => setEditing(null)}>
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
                <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
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
          onEdit={() => { setEditing(detail._id); setForm({ ...detail, dueDate: detail.dueDate ? detail.dueDate.slice(0,10) : '', project: detail.project?._id || detail.project || '', client: detail.client?._id || detail.client || '' }); setError(''); }}
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
                  {(t.images?.length || t.videos?.length || t.comments?.length) ? (
                    <div className="task-meta">
                      {t.images?.length > 0 && <span>🖼️ {t.images.length}</span>}
                      {t.videos?.length > 0 && <span>🎥 {t.videos.length}</span>}
                      {t.comments?.length > 0 && <span>💬 {t.comments.length}</span>}
                    </div>
                  ) : null}
                  <div className="task-meta">
                    {t.project?.title && <span>📁 {t.project.title}</span>}
                    {t.client?.name && <span>👤 {t.client.name}</span>}
                    {t.dueDate && <span>📅 {new Date(t.dueDate).toLocaleDateString('es-MX')}</span>}
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
  const imgInput = useRef(null);
  const vidInput = useRef(null);

  async function upload(kind, files) {
    if (!files?.length) return;
    setUploading(kind);
    setError('');
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const { data } = await api.post(`/tasks/${task._id}/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChanged(data);
    } catch (err) {
      setError(err.response?.data?.message || `Error subiendo ${kind}`);
    } finally {
      setUploading(null);
      if (kind === 'images' && imgInput.current) imgInput.current.value = '';
      if (kind === 'videos' && vidInput.current) vidInput.current.value = '';
    }
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
              <input ref={imgInput} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => upload('images', e.target.files)} />
              <button className="ghost small" disabled={uploading === 'images'} onClick={() => imgInput.current?.click()}>
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
              <input ref={vidInput} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => upload('videos', e.target.files)} />
              <button className="ghost small" disabled={uploading === 'videos'} onClick={() => vidInput.current?.click()}>
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
    </div>
  );
}
