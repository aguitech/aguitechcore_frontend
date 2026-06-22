import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';

// Mirrors Tasks.jsx categorization for icons
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
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'doc';
  if (['psd', 'ai', 'fig', 'sketch', 'xd'].includes(ext)) return 'design';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return 'other';
}

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

const EMPTY_POST = {
  title: '',
  excerpt: '',
  body: '',
  category: '',
  tags: '',
  status: 'borrador',
  coverImage: '',
  links: [],
};

export default function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(null); // post being edited
  const [form, setForm] = useState(EMPTY_POST);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [detail, setDetail] = useState(null); // post being viewed in detail modal
  const [showCatMgr, setShowCatMgr] = useState(false);

  // Initial load
  useEffect(() => {
    loadAll();
    api.get('/profile').then((r) => setMe(r.data.user)).catch(() => setMe(null));
  }, []);

  async function loadAll() {
    const [p, c] = await Promise.all([api.get('/blog/posts'), api.get('/blog/categories')]);
    setPosts(p.data);
    setCategories(c.data);
  }

  async function loadPosts() {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCategory) params.set('category', filterCategory);
    if (filterQ) params.set('q', filterQ);
    const qs = params.toString();
    const r = await api.get(`/blog/posts${qs ? '?' + qs : ''}`);
    setPosts(r.data);
  }
  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterCategory, filterQ]);

  function openCreate() {
    setEditing({ _id: null });
    setForm({ ...EMPTY_POST, category: categories[0]?._id || '' });
    setError('');
  }

  function openEdit(post) {
    setEditing(post);
    setForm({
      title: post.title || '',
      excerpt: post.excerpt || '',
      body: post.body || '',
      category: post.category?._id || post.category || '',
      tags: (post.tags || []).join(', '),
      status: post.status || 'borrador',
      coverImage: post.coverImage || '',
      links: post.links || [],
    });
    setError('');
  }

  function closeForm() {
    setEditing(null);
    setForm(EMPTY_POST);
    setError('');
  }

  async function savePost(e) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('El título es obligatorio');
    if (!form.category) return setError('Selecciona una categoría');
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        excerpt: form.excerpt,
        body: form.body,
        category: form.category,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: form.status,
        coverImage: form.coverImage,
        links: form.links,
      };
      if (editing._id) {
        await api.put(`/blog/posts/${editing._id}`, payload);
      } else {
        await api.post('/blog/posts', payload);
      }
      closeForm();
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.msg || 'Error al guardar');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(post) {
    const next = post.status === 'publicado' ? 'borrador' : 'publicado';
    await api.put(`/blog/posts/${post._id}`, { status: next });
    await loadAll();
  }

  async function removePost(post) {
    if (!confirm(`¿Eliminar "${post.title}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/blog/posts/${post._id}`);
    await loadAll();
  }

  // ===== attachment helpers (work on a saved post) =====
  async function attachFiles(post, kind, fileList) {
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f);
    await api.post(`/blog/posts/${post._id}/${kind}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function removeFile(post, kind, fileId) {
    await api.delete(`/blog/posts/${post._id}/files/${kind}/${fileId}`);
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function bulkRemoveFiles(post, kind, fileIds) {
    if (!fileIds || fileIds.length === 0) return;
    if (!confirm(`¿Eliminar ${fileIds.length} archivo(s)? Esta acción no se puede deshacer.`)) return;
    // delete in parallel — each one is independent
    await Promise.all(fileIds.map((id) =>
      api.delete(`/blog/posts/${post._id}/files/${kind}/${id}`).catch((err) => {
        console.error(`failed to delete ${kind}/${id}:`, err);
        return null;
      })
    ));
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function setCoverImage(post, fileId) {
    const file = (post.images || []).find((f) => String(f._id) === String(fileId));
    if (!file) return;
    await api.put(`/blog/posts/${post._id}`, { coverImage: file.url });
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function addLinkToDetail() {
    if (!detail) return;
    const url = prompt('URL del link:');
    if (!url) return;
    const title = prompt('Título (opcional):') || '';
    const description = prompt('Descripción (opcional):') || '';
    await api.post(`/blog/posts/${detail._id}/links`, { url, title, description });
    const r = await api.get(`/blog/posts/${detail._id}`);
    setDetail(r.data);
  }

  async function removeLink(linkId) {
    if (!detail) return;
    if (!confirm('¿Eliminar este link?')) return;
    await api.delete(`/blog/posts/${detail._id}/links/${linkId}`);
    const r = await api.get(`/blog/posts/${detail._id}`);
    setDetail(r.data);
  }

  async function postComment(text) {
    if (!detail || !text.trim()) return;
    await api.post(`/blog/posts/${detail._id}/comments`, { text });
    const r = await api.get(`/blog/posts/${detail._id}`);
    setDetail(r.data);
  }

  async function deleteComment(commentId) {
    if (!detail) return;
    if (!confirm('¿Eliminar este comentario?')) return;
    await api.delete(`/blog/posts/${detail._id}/comments/${commentId}`);
    const r = await api.get(`/blog/posts/${detail._id}`);
    setDetail(r.data);
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>📰 Blog</h1>
            <p className="muted">Publicaciones con imágenes, videos, documentos, links y notas.</p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setShowCatMgr(true)}>
              ⚙️ Categorías
            </button>
            <button className="btn primary" onClick={openCreate} disabled={categories.length === 0}>
              ＋ Nueva publicación
            </button>
          </div>
        </div>

        {categories.length === 0 && (
          <div className="banner info">
            Antes de crear publicaciones necesitas al menos una categoría.{' '}
            <button className="link" onClick={() => setShowCatMgr(true)}>
              Crear categoría
            </button>
          </div>
        )}

        {/* filters */}
        <div className="filters">
          <input
            type="text"
            placeholder="Buscar publicación..."
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="input"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="publicado">Publicado</option>
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input">
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* post list */}
        <div className="card-grid">
          {posts.length === 0 && (
            <div className="empty">
              <p>📭 No hay publicaciones todavía.</p>
              <button className="btn primary" onClick={openCreate} disabled={categories.length === 0}>
                Crear la primera
              </button>
            </div>
          )}
          {posts.map((p) => (
            <article key={p._id} className="post-card" onClick={() => setDetail(p)}>
              {p.coverImage ? (
                <div
                  className="post-cover"
                  style={{ backgroundImage: `url(${p.coverImage})` }}
                />
              ) : (
                <div className="post-cover placeholder">
                  <span style={{ fontSize: 48 }}>{p.category?.icon || '📝'}</span>
                </div>
              )}
              <div className="post-body">
                <div className="post-meta">
                  <span
                    className="badge"
                    style={{ background: (p.category?.color || '#FF6A00') + '22', color: p.category?.color || '#FF6A00' }}
                  >
                    {p.category?.icon} {p.category?.name || 'Sin categoría'}
                  </span>
                  <span className={`status ${p.status}`}>{p.status}</span>
                </div>
                <h3>{p.title}</h3>
                {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
                <div className="post-footer">
                  <span className="muted small">{timeAgo(p.updatedAt)}</span>
                  <span className="muted small">
                    {(p.images?.length || 0) + (p.videos?.length || 0) + (p.documents?.length || 0)} adjuntos · {p.comments?.length || 0} notas
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* ===== create/edit modal ===== */}
      {editing && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{editing._id ? 'Editar publicación' : 'Nueva publicación'}</h2>
              <button className="close" onClick={closeForm} aria-label="Cerrar">×</button>
            </header>
            <form onSubmit={savePost} className="form">
              {error && <div className="banner error">{error}</div>}
              <label>
                Título *
                <input
                  className="input"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Título de la publicación"
                  required
                />
              </label>
              <div className="row two">
                <label>
                  Categoría *
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    required
                  >
                    <option value="">Selecciona...</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estado
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="borrador">Borrador</option>
                    <option value="publicado">Publicado</option>
                  </select>
                </label>
              </div>
              <label>
                Resumen
                <textarea
                  className="input"
                  rows={2}
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  placeholder="Resumen corto (aparece en la lista)"
                  maxLength={500}
                />
              </label>
              <label>
                Contenido / Nota
                <textarea
                  className="input"
                  rows={8}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Texto principal de la publicación. Puedes escribir notas largas, anuncios, tutoriales..."
                />
              </label>
              <label>
                Etiquetas (separadas por coma)
                <input
                  className="input"
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="ej. anuncio, tutorial, dream-team"
                />
              </label>
              <label>
                Imagen de portada (URL — opcional)
                <input
                  className="input"
                  type="text"
                  value={form.coverImage}
                  onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                  placeholder="https://... o sube una imagen después y pega su URL aquí"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Guardando...' : editing._id ? 'Guardar cambios' : 'Crear publicación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== detail modal ===== */}
      {detail && (
        <PostDetailModal
          post={detail}
          me={me}
          onClose={() => setDetail(null)}
          onEdit={(p) => {
            setDetail(null);
            openEdit(p);
          }}
          onTogglePublish={async (p) => {
            await togglePublish(p);
            const r = await api.get(`/blog/posts/${p._id}`);
            setDetail(r.data);
          }}
          onDelete={async (p) => {
            await removePost(p);
            setDetail(null);
          }}
          onAttach={attachFiles}
          onRemoveFile={removeFile}
          onBulkRemove={bulkRemoveFiles}
          onSetCover={setCoverImage}
          onAddLink={addLinkToDetail}
          onRemoveLink={removeLink}
          onPostComment={postComment}
          onDeleteComment={deleteComment}
        />
      )}

      {/* ===== categories manager ===== */}
      {showCatMgr && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCatMgr(false)}
          onChange={async () => {
            await loadAll();
          }}
        />
      )}
    </Layout>
  );
}

// ============ detail modal ============
function PostDetailModal({
  post,
  me,
  onClose,
  onEdit,
  onTogglePublish,
  onDelete,
  onAttach,
  onRemoveFile,
  onBulkRemove,
  onSetCover,
  onAddLink,
  onRemoveLink,
  onPostComment,
  onDeleteComment,
}) {
  const [tab, setTab] = useState('content');
  const [commentText, setCommentText] = useState('');
  const [busyComment, setBusyComment] = useState(false);

  async function submitComment() {
    if (!commentText.trim()) return;
    setBusyComment(true);
    try {
      await onPostComment(commentText);
      setCommentText('');
    } finally {
      setBusyComment(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal xlarge" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{post.title}</h2>
            <div className="post-meta">
              <span
                className="badge"
                style={{
                  background: (post.category?.color || '#FF6A00') + '22',
                  color: post.category?.color || '#FF6A00',
                }}
              >
                {post.category?.icon} {post.category?.name}
              </span>
              <span className={`status ${post.status}`}>{post.status}</span>
              <span className="muted small">
                {post.publishedAt ? `Publicado ${timeAgo(post.publishedAt)}` : 'Sin publicar'}
              </span>
            </div>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => onEdit(post)}>Editar</button>
            <button className="btn ghost" onClick={() => onTogglePublish(post)}>
              {post.status === 'publicado' ? '⏸ Pasar a borrador' : '▶ Publicar'}
            </button>
            <button className="btn danger" onClick={() => onDelete(post)}>Eliminar</button>
            <button className="close" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>

        <div className="tabs">
          <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>
            📝 Contenido
          </button>
          <button className={`tab ${tab === 'images' ? 'active' : ''}`} onClick={() => setTab('images')}>
            🖼️ Imágenes ({post.images?.length || 0})
          </button>
          <button className={`tab ${tab === 'videos' ? 'active' : ''}`} onClick={() => setTab('videos')}>
            🎬 Videos ({post.videos?.length || 0})
          </button>
          <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
            📎 Documentos ({post.documents?.length || 0})
          </button>
          <button className={`tab ${tab === 'links' ? 'active' : ''}`} onClick={() => setTab('links')}>
            🔗 Links ({post.links?.length || 0})
          </button>
          <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
            💬 Notas ({post.comments?.length || 0})
          </button>
        </div>

        <div className="tab-body">
          {tab === 'content' && (
            <div>
              {post.coverImage && (
                <div
                  className="cover-preview"
                  style={{ backgroundImage: `url(${post.coverImage})` }}
                />
              )}
              {post.excerpt && <p className="excerpt">{post.excerpt}</p>}
              {post.body ? (
                <pre className="body">{post.body}</pre>
              ) : (
                <p className="muted">Sin contenido.</p>
              )}
              {post.tags?.length > 0 && (
                <div className="tags">
                  {post.tags.map((t, i) => (
                    <span key={i} className="tag">#{t}</span>
                  ))}
                </div>
              )}
              <div className="muted small">👁 {post.views || 0} vistas · ✍️ {post.author?.name || '—'}</div>
            </div>
          )}

          {tab === 'images' && (
            <AttachmentGallery
              kind="images"
              files={detail.images || []}
              onAttach={(files) => attachFiles(detail, 'images', files)}
              onRemove={(fileId) => removeFile(detail, 'images', fileId)}
              onBulkRemove={(ids) => bulkRemoveFiles(detail, 'images', ids)}
              onSetCover={(fileId) => setCoverImage(detail, fileId)}
              accept="image/*"
              uploadLabel="Subir imágenes"
              isCover={(file) => detail.coverImage && detail.coverImage === file.url}
            />
          )}
          {tab === 'videos' && (
            <AttachmentGallery
              kind="videos"
              files={detail.videos || []}
              onAttach={(files) => attachFiles(detail, 'videos', files)}
              onRemove={(fileId) => removeFile(detail, 'videos', fileId)}
              onBulkRemove={(ids) => bulkRemoveFiles(detail, 'videos', ids)}
              onSetCover={null}
              accept="video/*"
              uploadLabel="Subir videos"
              isCover={null}
            />
          )}
          {tab === 'docs' && (
            <AttachmentGallery
              kind="documents"
              files={detail.documents || []}
              onAttach={(files) => attachFiles(detail, 'documents', files)}
              onRemove={(fileId) => removeFile(detail, 'documents', fileId)}
              onBulkRemove={(ids) => bulkRemoveFiles(detail, 'documents', ids)}
              onSetCover={null}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z,.csv"
              uploadLabel="Subir documentos"
              isCover={null}
            />
          )}

          {tab === 'links' && (
            <div>
              <button className="btn primary" onClick={onAddLink}>＋ Agregar link</button>
              {(!post.links || post.links.length === 0) && (
                <p className="muted">Sin links todavía.</p>
              )}
              <ul className="link-list">
                {post.links?.map((l) => (
                  <li key={l._id}>
                    <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a>
                    {l.description && <p className="muted small">{l.description}</p>}
                    <button className="btn ghost danger small" onClick={() => onRemoveLink(l._id)}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'notes' && (
            <div>
              <div className="comment-composer">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Escribe una nota o comentario..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={submitComment}
                  disabled={busyComment || !commentText.trim()}
                >
                  {busyComment ? 'Enviando...' : 'Publicar nota'}
                </button>
              </div>
              {(!post.comments || post.comments.length === 0) && (
                <p className="muted">Sin notas todavía.</p>
              )}
              <ul className="comment-list">
                {post.comments?.map((c) => {
                  const authorId = c.author?._id || c.author;
                  const canDelete =
                    me && (String(me._id) === String(authorId) ||
                           me.role === 'admin' ||
                           String(me._id) === String(post.author?._id || post.author));
                  return (
                    <li key={c._id} className="comment">
                      <div className="comment-head">
                        <strong>{c.author?.name || c.authorName || 'Usuario'}</strong>
                        <span className="muted small">{timeAgo(c.createdAt)}</span>
                      </div>
                      <p>{c.text}</p>
                      {canDelete && (
                        <button className="btn ghost danger small" onClick={() => onDeleteComment(c._id)}>
                          Eliminar
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ attachment gallery — supports multi-file, lightbox, bulk delete ============
function AttachmentGallery({
  files,
  onAttach,
  onRemove,
  onBulkRemove,
  onSetCover,
  accept,
  uploadLabel,
  isCover,
}) {
  const inputRef = useRef(null);
  const [selected, setSelected] = useState(new Set()); // file _ids
  const [lightboxIdx, setLightboxIdx] = useState(null); // index of image in lightbox, null=closed
  const [uploading, setUploading] = useState(false);

  function pick() {
    inputRef.current?.click();
  }

  async function onChange(e) {
    const fl = Array.from(e.target.files || []);
    if (fl.length === 0) return;
    setUploading(true);
    try {
      await onAttach(fl);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function toggleSelect(fileId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(files.map((f) => f._id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function bulkDelete() {
    onBulkRemove(Array.from(selected));
    clearSelection();
  }

  function openLightbox(file, idx) {
    const isImg = (file.mimetype || '').startsWith('image/');
    const isVid = (file.mimetype || '').startsWith('video/');
    if (!isImg && !isVid) {
      // documents — open in new tab
      window.open(file.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setLightboxIdx(idx);
  }

  function closeLightbox() {
    setLightboxIdx(null);
  }

  function lightboxPrev() {
    setLightboxIdx((i) => (i > 0 ? i - 1 : files.length - 1));
  }

  function lightboxNext() {
    setLightboxIdx((i) => (i < files.length - 1 ? i + 1 : 0));
  }

  // keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxPrev();
      else if (e.key === 'ArrowRight') lightboxNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIdx, files.length]);

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  return (
    <div>
      {/* toolbar */}
      <div className="gallery-toolbar">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          style={{ display: 'none' }}
          onChange={onChange}
        />
        <button className="btn primary" onClick={pick} disabled={uploading}>
          {uploading ? '⏳ Subiendo...' : `📤 ${uploadLabel}`}
        </button>
        <span className="muted small">
          {files.length} {files.length === 1 ? 'archivo' : 'archivos'} · {fmtSize(totalSize)}
        </span>
        <div className="gallery-toolbar-right">
          {files.length > 0 && (
            <>
              {selected.size === 0 ? (
                <button className="btn ghost small" onClick={selectAll}>
                  ☑️ Seleccionar todos
                </button>
              ) : (
                <>
                  <span className="muted small">{selected.size} seleccionados</span>
                  <button className="btn ghost small" onClick={clearSelection}>
                    Limpiar
                  </button>
                  <button className="btn danger small" onClick={bulkDelete}>
                    🗑 Eliminar {selected.size}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {files.length === 0 && (
        <p className="muted" style={{ marginTop: 16 }}>
          Sin archivos. Usa el botón "Subir" para agregar varios a la vez.
        </p>
      )}

      {/* gallery grid */}
      <div className="gallery-grid">
        {files.map((f, idx) => {
          const isImg = (f.mimetype || '').startsWith('image/');
          const isVid = (f.mimetype || '').startsWith('video/');
          const isSel = selected.has(f._id);
          const cover = isCover ? isCover(f) : false;
          return (
            <div
              key={f._id}
              className={`gallery-tile ${isSel ? 'selected' : ''} ${cover ? 'is-cover' : ''}`}
            >
              {/* selection checkbox */}
              <button
                type="button"
                className={`gallery-select ${isSel ? 'on' : ''}`}
                onClick={() => toggleSelect(f._id)}
                title={isSel ? 'Quitar de selección' : 'Seleccionar'}
                aria-label="Seleccionar"
              >
                {isSel ? '✓' : ''}
              </button>

              {/* cover badge (images only) */}
              {cover && <span className="cover-badge">⭐ Portada</span>}

              {/* preview */}
              <div className="gallery-preview" onClick={() => openLightbox(f, idx)}>
                {isImg ? (
                  <img src={f.url} alt={f.filename} loading="lazy" />
                ) : isVid ? (
                  <>
                    <video src={f.url} preload="metadata" />
                    <span className="video-play-icon">▶</span>
                  </>
                ) : (
                  <div className="doc-tile">
                    <span className="file-icon-big">{fileIcon(f.mimetype, f.filename)}</span>
                    <span className="file-name-sm">{f.filename}</span>
                    <span className="muted small">{fmtSize(f.size)}</span>
                  </div>
                )}
              </div>

              {/* meta */}
              <div className="gallery-meta">
                <span className="gallery-filename" title={f.filename}>
                  {f.filename.length > 24 ? f.filename.slice(0, 21) + '…' : f.filename}
                </span>
                <span className="muted small">{fmtSize(f.size)}</span>
              </div>

              {/* actions */}
              <div className="gallery-actions">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn ghost small"
                  title="Abrir en nueva pestaña"
                >
                  ↗
                </a>
                {isImg && onSetCover && (
                  <button
                    type="button"
                    className={`btn ghost small ${cover ? 'active' : ''}`}
                    onClick={() => onSetCover(f._id)}
                    title={cover ? 'Ya es la portada' : 'Usar como portada'}
                  >
                    ⭐
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost danger small"
                  onClick={() => onRemove(f._id)}
                  title="Eliminar"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* lightbox */}
      {lightboxFile && (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <div className="lightbox" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox} aria-label="Cerrar">
              ×
            </button>
            {files.length > 1 && (
              <>
                <button
                  className="lightbox-nav lightbox-prev"
                  onClick={lightboxPrev}
                  aria-label="Anterior"
                >
                  ‹
                </button>
                <button
                  className="lightbox-nav lightbox-next"
                  onClick={lightboxNext}
                  aria-label="Siguiente"
                >
                  ›
                </button>
              </>
            )}
            <div className="lightbox-content">
              {(lightboxFile.mimetype || '').startsWith('image/') ? (
                <img src={lightboxFile.url} alt={lightboxFile.filename} />
              ) : (
                <video src={lightboxFile.url} controls autoPlay />
              )}
            </div>
            <div className="lightbox-footer">
              <strong>{lightboxFile.filename}</strong>
              <span className="muted small">
                {fmtSize(lightboxFile.size)} · {lightboxIdx + 1}/{files.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ category manager ============
function CategoryManager({ categories, onClose, onChange }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF6A00');
  const [icon, setIcon] = useState('📝');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('Nombre requerido');
      return;
    }
    setError('');
    try {
      if (editingId) {
        await api.put(`/blog/categories/${editingId}`, {
          name,
          color,
          icon,
          description,
        });
      } else {
        await api.post('/blog/categories', { name, color, icon, description });
      }
      setName('');
      setColor('#FF6A00');
      setIcon('📝');
      setDescription('');
      setEditingId(null);
      await onChange();
    } catch (err) {
      setError(err.response?.data?.msg || 'Error al guardar');
    }
  }

  function startEdit(c) {
    setEditingId(c._id);
    setName(c.name);
    setColor(c.color || '#FF6A00');
    setIcon(c.icon || '📝');
    setDescription(c.description || '');
  }

  async function remove(c) {
    if (!confirm(`¿Eliminar la categoría "${c.name}"? Solo se puede si no tiene publicaciones.`)) return;
    try {
      await api.delete(`/blog/categories/${c._id}`);
      await onChange();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error al eliminar');
    }
  }

  const ICON_OPTIONS = ['📝', '📰', '🚀', '💡', '🔧', '🎨', '📊', '⚽', '🎵', '🎬', '📚', '✨', '🔥', '💼', '🌐'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Categorías del blog</h2>
          <button className="close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {error && <div className="banner error">{error}</div>}

        <div className="form">
          <div className="row two">
            <label>
              {editingId ? 'Editar' : 'Nueva'} categoría *
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Anuncios, Tutoriales, Dream Team"
              />
            </label>
            <label>
              Color
              <input
                className="input"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
          <label>
            Ícono
            <div className="icon-picker">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={`icon-opt ${icon === ic ? 'active' : ''}`}
                  onClick={() => setIcon(ic)}
                >
                  {ic}
                </button>
              ))}
            </div>
          </label>
          <label>
            Descripción
            <input
              className="input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción corta (opcional)"
            />
          </label>
          <div className="modal-actions">
            {editingId && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setColor('#FF6A00');
                  setIcon('📝');
                  setDescription('');
                }}
              >
                Cancelar edición
              </button>
            )}
            <button type="button" className="btn primary" onClick={save}>
              {editingId ? 'Guardar cambios' : 'Crear categoría'}
            </button>
          </div>
        </div>

        <hr />

        <ul className="category-list">
          {categories.length === 0 && <li className="muted">No hay categorías todavía.</li>}
          {categories.map((c) => (
            <li key={c._id}>
              <span className="cat-badge" style={{ background: (c.color || '#FF6A00') + '22', color: c.color || '#FF6A00' }}>
                {c.icon} {c.name}
              </span>
              <span className="muted small">{c.postCount || 0} publicaciones</span>
              <div className="actions">
                <button className="btn ghost small" onClick={() => startEdit(c)}>Editar</button>
                <button className="btn ghost danger small" onClick={() => remove(c)}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}