import { useEffect, useRef, useState } from 'react';
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

// Validate a File against an `accept` string (e.g. "image/*", "video/*",
// ".pdf,.doc,.docx"). Returns true if the file is allowed.
function matchesAccept(file, accept) {
  if (!accept) return true;
  const tokens = accept.split(',').map((t) => t.trim()).filter(Boolean);
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  for (const t of tokens) {
    if (t.startsWith('.')) {
      if (name.endsWith(t.toLowerCase())) return true;
    } else if (t.endsWith('/*')) {
      const prefix = t.slice(0, -1).toLowerCase(); // "image/*" -> "image/"
      if (mime.startsWith(prefix)) return true;
    } else if (mime === t.toLowerCase()) {
      return true;
    }
  }
  return false;
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

// hook: light debounce for typing in the search box
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// toast for success feedback
function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(null); // post being edited/created (has _id or _id=null for create)
  const [form, setForm] = useState(EMPTY_POST);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const debouncedQ = useDebounced(filterQ);
  const [detail, setDetail] = useState(null); // post being viewed in detail modal
  const [editingDetail, setEditingDetail] = useState(false); // toggle inline edit mode in detail
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [toast, setToast] = useToast();
  // Pending uploads for new posts (the new post is created on save, then these
  // queues are uploaded to it as images / videos / documents)
  const [pendingImages, setPendingImages] = useState([]);
  const [pendingVideos, setPendingVideos] = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);

  // Initial load
  useEffect(() => {
    loadAll();
    api.get('/profile').then((r) => setMe(r.data.user)).catch(() => setMe(null));
  }, []);

  async function loadAll() {
    setLoadingPosts(true);
    try {
      const [p, c] = await Promise.all([
        api.get('/blog/posts'),
        api.get('/blog/categories'),
      ]);
      setPosts(p.data);
      setCategories(c.data);
    } catch (err) {
      setError(err.response?.data?.msg || 'Error al cargar publicaciones');
    } finally {
      setLoadingPosts(false);
    }
  }

  async function loadPosts() {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCategory) params.set('category', filterCategory);
    if (debouncedQ) params.set('q', debouncedQ);
    const qs = params.toString();
    setLoadingPosts(true);
    try {
      const r = await api.get(`/blog/posts${qs ? '?' + qs : ''}`);
      setPosts(r.data);
    } catch (err) {
      setError(err.response?.data?.msg || 'Error al filtrar publicaciones');
    } finally {
      setLoadingPosts(false);
    }
  }
  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterCategory, debouncedQ]);

  function openCreate() {
    setEditing({ _id: null });
    setForm({ ...EMPTY_POST, category: categories[0]?._id || '' });
    setError('');
    setPendingImages([]);
    setPendingVideos([]);
    setPendingDocs([]);
    // Create a placeholder post object so the detail modal renders in create mode
    setDetail({ _id: null, status: 'borrador', tags: [], images: [], videos: [], documents: [], links: [], comments: [] });
    setEditingDetail(true);
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
    if (e && e.preventDefault) e.preventDefault();
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
      let savedId = editing._id;
      if (editing._id) {
        await api.put(`/blog/posts/${editing._id}`, payload);
        setToast({ type: 'success', text: 'Publicación actualizada' });
      } else {
        const r = await api.post('/blog/posts', payload);
        savedId = r.data._id;
        setToast({ type: 'success', text: 'Publicación creada' });
      }
      // For NEW posts, upload any pending files now that we have a saved _id
      if (!editing._id && savedId) {
        const pendingGroups = [
          { kind: 'images', files: pendingImages },
          { kind: 'videos', files: pendingVideos },
          { kind: 'documents', files: pendingDocs },
        ];
        let totalUploaded = 0;
        for (const g of pendingGroups) {
          if (g.files && g.files.length > 0) {
            const fd = new FormData();
            for (const f of g.files) fd.append('files', f);
            try {
              // IMPORTANT: do NOT set Content-Type manually. Axios auto-sets
              // `multipart/form-data; boundary=...` for FormData bodies. Forcing
              // it without the boundary breaks multer's part parsing silently.
              await api.post(`/blog/posts/${savedId}/${g.kind}`, fd);
              totalUploaded += g.files.length;
            } catch (err) {
              console.error(`failed to upload ${g.kind}:`, err);
              setToast({
                type: 'error',
                text: `Error subiendo ${g.kind}: ${err.response?.data?.msg || err.message}`,
              });
            }
          }
        }
        if (totalUploaded > 0) {
          setToast({ type: 'success', text: `Publicación creada y ${totalUploaded} archivo(s) subido(s)` });
        }
        // Reset pending queues
        setPendingImages([]);
        setPendingVideos([]);
        setPendingDocs([]);
      }
      // refresh in place
      closeForm();
      setEditingDetail(false);
      if (savedId) {
        const r = await api.get(`/blog/posts/${savedId}`);
        setDetail(r.data);
      } else {
        setDetail(null);
      }
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
    setToast({
      type: 'success',
      text: next === 'publicado' ? 'Publicada ✓' : 'Pasada a borrador',
    });
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function removePost(post) {
    if (!confirm(`¿Eliminar "${post.title}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/blog/posts/${post._id}`);
    setToast({ type: 'success', text: 'Publicación eliminada' });
    await loadAll();
    if (detail?._id === post._id) setDetail(null);
  }

  // Permission helpers — admin can do anything, member only on own posts
  function canEditPost(post) {
    if (!me || !post) return false;
    if (me.role === 'admin') return true;
    const authorId = post.author?._id || post.author;
    return String(me._id) === String(authorId);
  }

  // ===== attachment helpers (work on a saved post) =====
  async function attachFiles(post, kind, fileList) {
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f);
    // IMPORTANT: do NOT set Content-Type manually. Axios auto-sets
    // `multipart/form-data; boundary=...` for FormData bodies.
    await api.post(`/blog/posts/${post._id}/${kind}`, fd);
    setToast({ type: 'success', text: `${fileList.length} archivo(s) subido(s)` });
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
    await Promise.all(fileIds.map((id) =>
      api.delete(`/blog/posts/${post._id}/files/${kind}/${id}`).catch((err) => {
        console.error(`failed to delete ${kind}/${id}:`, err);
        return null;
      })
    ));
    setToast({ type: 'success', text: `${fileIds.length} archivo(s) eliminado(s)` });
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
    setToast({ type: 'success', text: 'Portada actualizada' });
    await loadAll();
    if (detail?._id === post._id) {
      const r = await api.get(`/blog/posts/${post._id}`);
      setDetail(r.data);
    }
  }

  async function addLinkToDetail(url, title, description) {
    if (!detail) return;
    await api.post(`/blog/posts/${detail._id}/links`, { url, title, description });
    const r = await api.get(`/blog/posts/${detail._id}`);
    setDetail(r.data);
    setToast({ type: 'success', text: 'Link agregado' });
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

  const filtersActive = filterStatus || filterCategory || debouncedQ;
  const totalAttachments = posts.reduce(
    (n, p) =>
      n +
      (p.images?.length || 0) +
      (p.videos?.length || 0) +
      (p.documents?.length || 0),
    0
  );

  // Renders the post grid (or empty/loading state). Extracted to a
  // helper because the inline-edit focus mode needs to hide it.
  function renderPostGrid() {
    if (loadingPosts) {
      return <div className="muted center pad">⏳ Cargando publicaciones…</div>;
    }
    if (posts.length === 0) {
      return (
        <div className="empty">
          <span style={{ fontSize: 64 }}>📭</span>
          <h3>
            No hay publicaciones{filtersActive ? ' con esos filtros' : ' todavía'}
          </h3>
          <p className="muted">
            {filtersActive
              ? 'Intenta limpiar los filtros o ajustar la búsqueda.'
              : 'Crea la primera publicación para empezar.'}
          </p>
          {filtersActive ? (
            <button
              className="btn ghost"
              onClick={() => {
                setFilterQ('');
                setFilterStatus('');
                setFilterCategory('');
              }}
            >
              ✕ Limpiar filtros
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={openCreate}
              disabled={categories.length === 0}
            >
              ＋ Crear la primera
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="card-grid">
        {posts.map((p) => {
          const editable = canEditPost(p);
          return (
            <article
              key={p._id}
              className="post-card"
              onClick={(e) => {
                if (e.target.closest('.post-quick-actions')) return;
                setDetail(p);
              }}
            >
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
                    style={{
                      background: (p.category?.color || '#FF6A00') + '22',
                      color: p.category?.color || '#FF6A00',
                    }}
                  >
                    {p.category?.icon} {p.category?.name || 'Sin categoría'}
                  </span>
                  <span className={`status ${p.status}`}>
                    {p.status === 'publicado' ? '✅ Publicado' : '📝 Borrador'}
                  </span>
                </div>
                <h3>{p.title}</h3>
                {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
                <div className="post-footer">
                  <span className="muted small">{timeAgo(p.updatedAt)}</span>
                  <span className="muted small">
                    {(p.images?.length || 0) +
                      (p.videos?.length || 0) +
                      (p.documents?.length || 0)}{' '}
                    adjuntos · {p.comments?.length || 0} notas
                  </span>
                </div>
                <div
                  className="post-quick-actions"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {editable ? (
                    <>
                      <button
                        className="btn ghost small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDetail(p);
                          openEdit(p);
                          setEditingDetail(true);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Editar publicación"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        className="btn ghost small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePublish(p);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={
                          p.status === 'publicado'
                            ? 'Pasar a borrador'
                            : 'Publicar'
                        }
                      >
                        {p.status === 'publicado' ? '⏸ Borrador' : '▶ Publicar'}
                      </button>
                      <button
                        className="btn ghost danger small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removePost(p);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Eliminar publicación"
                      >
                        🗑
                      </button>
                    </>
                  ) : (
                    <span className="muted small">Solo lectura</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  // isCreating = detail modal in create mode (no _id)
  const isCreating = editing && !editing._id;

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>📰 Blog</h1>
            <p className="muted">
              {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}
              {' · '}
              {totalAttachments} adjuntos totales
            </p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setShowCatMgr(true)}>
              ⚙️ Categorías
            </button>
            <button
              className="btn primary"
              onClick={openCreate}
              disabled={categories.length === 0}
            >
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
            placeholder="🔍 Buscar publicación por título, contenido o tag…"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="input"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input"
          >
            <option value="">📋 Todos los estados</option>
            <option value="borrador">📝 Borrador</option>
            <option value="publicado">✅ Publicado</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input"
          >
            <option value="">🏷️ Todas las categorías</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              className="btn ghost small"
              onClick={() => {
                setFilterQ('');
                setFilterStatus('');
                setFilterCategory('');
              }}
              title="Limpiar filtros"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* post list — hidden while inline-editing a post so the user can focus */}
        {!editingDetail && renderPostGrid()}
        {editingDetail && (
          <div className="focus-mode-hint">
            ✏️ <strong>Modo {isCreating ? 'creación' : 'edición'}:</strong> las demás
            publicaciones están ocultas para que te enfoques en esta. Al guardar o
            cancelar volverás al listado.
          </div>
        )}
      </div>

      {/* ===== detail modal (single source of truth for create + edit + view) ===== */}
      {detail && (
        <PostDetailModal
          post={detail}
          me={me}
          onClose={() => setDetail(null)}
          onEdit={(p) => {
            if (!canEditPost(p)) {
              alert('No tienes permisos para editar esta publicación');
              return;
            }
            openEdit(p);
            setEditingDetail(true);
          }}
          onTogglePublish={async (p) => {
            if (!canEditPost(p)) {
              alert('No tienes permisos para cambiar el estado de esta publicación');
              return;
            }
            await togglePublish(p);
            const r = await api.get(`/blog/posts/${p._id}`);
            setDetail(r.data);
          }}
          onDelete={async (p) => {
            if (!canEditPost(p)) {
              alert('No tienes permisos para eliminar esta publicación');
              return;
            }
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
          canEdit={canEditPost(detail)}
          editingDetail={editingDetail}
          isCreating={isCreating}
          form={form}
          setForm={setForm}
          categories={categories}
          busy={busy}
          error={error}
          onSave={savePost}
          onCancelEdit={() => {
            closeForm();
            setEditingDetail(false);
            if (isCreating) setDetail(null);
          }}
          onBackToList={() => setDetail(null)}
          pendingImages={pendingImages}
          setPendingImages={setPendingImages}
          pendingVideos={pendingVideos}
          setPendingVideos={setPendingVideos}
          pendingDocs={pendingDocs}
          setPendingDocs={setPendingDocs}
        />
      )}

      {/* ===== categories manager ===== */}
      {showCatMgr && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCatMgr(false)}
          onChange={async () => {
            await loadAll();
            setToast({ type: 'success', text: 'Categorías actualizadas' });
          }}
        />
      )}

      {/* ===== toast notifications ===== */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.text}</div>
      )}
    </Layout>
  );
}

// ============ detail modal (view / create / edit — single source of truth) ============
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
  canEdit,
  editingDetail = false,
  isCreating = false,
  form,
  setForm,
  categories = [],
  busy = false,
  error = '',
  onSave,
  onCancelEdit,
  onBackToList,
  pendingImages = [],
  setPendingImages = () => {},
  pendingVideos = [],
  setPendingVideos = () => {},
  pendingDocs = [],
  setPendingDocs = () => {},
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

  const images = post.images || [];
  const videos = post.videos || [];
  const documents = post.documents || [];
  const links = post.links || [];
  const comments = post.comments || [];

  return (
    <div
      className="modal-backdrop"
      onClick={editingDetail ? onCancelEdit : onClose}
    >
      <div className="modal xlarge" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            {editingDetail && (
              <div className="breadcrumb">
                <button
                  type="button"
                  className="link"
                  onClick={onCancelEdit}
                  title="Cancelar y volver al listado"
                >
                  ← {isCreating ? 'Cancelar creación' : 'Volver al detalle'}
                </button>
                <span className="muted"> · </span>
                <span className="muted">
                  {isCreating ? 'Creando nueva publicación' : `Editando: ${post.title}`}
                </span>
              </div>
            )}
            <h2>
              {editingDetail ? (
                <span>
                  {isCreating ? '＋ ' : '✏️ '}
                  <input
                    type="text"
                    className="input inline-title-edit"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Título de la publicación"
                    autoFocus
                  />
                </span>
              ) : (
                post.title
              )}
            </h2>
            <div className="post-meta">
              {editingDetail ? (
                <>
                  <select
                    className="input tiny"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">📁 Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input tiny"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="borrador">📝 Borrador</option>
                    <option value="publicado">✅ Publicado</option>
                  </select>
                </>
              ) : (
                <>
                  <span
                    className="badge"
                    style={{
                      background: (post.category?.color || '#FF6A00') + '22',
                      color: post.category?.color || '#FF6A00',
                    }}
                  >
                    {post.category?.icon} {post.category?.name}
                  </span>
                  <span className={`status ${post.status}`}>
                    {post.status === 'publicado' ? '✅ Publicado' : '📝 Borrador'}
                  </span>
                  <span className="muted small">
                    {post.publishedAt
                      ? `Publicado ${timeAgo(post.publishedAt)}`
                      : 'Sin publicar'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="actions">
            {!editingDetail && canEdit && !isCreating && (
              <>
                <button
                  className="btn primary"
                  onClick={() => onEdit(post)}
                  title="Editar esta publicación"
                >
                  ✏️ Editar
                </button>
                <button className="btn ghost" onClick={() => onTogglePublish(post)}>
                  {post.status === 'publicado' ? '⏸ Borrador' : '▶ Publicar'}
                </button>
                <button className="btn danger" onClick={() => onDelete(post)}>
                  🗑 Eliminar
                </button>
              </>
            )}
            {!editingDetail && !canEdit && (
              <span className="muted small badge">Solo lectura</span>
            )}
            {editingDetail && (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={onCancelEdit}
                  disabled={busy}
                >
                  ↩ Cancelar
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={onSave}
                  disabled={busy}
                >
                  {busy
                    ? '⏳ Guardando…'
                    : isCreating
                    ? '✨ Crear publicación'
                    : '💾 Guardar cambios'}
                </button>
              </>
            )}
            <button
              className="close"
              onClick={editingDetail ? onCancelEdit : onClose}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </header>

        {editingDetail ? (
          // ============ EDIT/CREATE MODE ============
          <>
            <div className="tabs">
              <button
                className={`tab ${tab === 'content' ? 'active' : ''}`}
                onClick={() => setTab('content')}
              >
                📝 Contenido
              </button>
              <button
                className={`tab ${tab === 'images' ? 'active' : ''}`}
                onClick={() => setTab('images')}
              >
                🖼️ Imágenes ({isCreating ? pendingImages.length : images.length}
                {isCreating && pendingImages.length > 0 ? ' pendientes' : ''})
              </button>
              <button
                className={`tab ${tab === 'videos' ? 'active' : ''}`}
                onClick={() => setTab('videos')}
              >
                🎬 Videos ({isCreating ? pendingVideos.length : videos.length}
                {isCreating && pendingVideos.length > 0 ? ' pendientes' : ''})
              </button>
              <button
                className={`tab ${tab === 'docs' ? 'active' : ''}`}
                onClick={() => setTab('docs')}
              >
                📎 Documentos ({isCreating ? pendingDocs.length : documents.length}
                {isCreating && pendingDocs.length > 0 ? ' pendientes' : ''})
              </button>
            </div>

            <div className="tab-body">
              {error && <div className="banner error">{error}</div>}

              {tab === 'content' && (
                <div className="edit-grid">
                  <div className="edit-main">
                    <CoverImageField
                      value={form.coverImage}
                      onChange={(v) => setForm({ ...form, coverImage: v })}
                      post={isCreating ? null : post}
                      canEdit={!isCreating}
                      onUpload={async (file) => {
                        if (!post || !post._id) {
                          setToast?.({
                            type: 'error',
                            text: 'Guarda la publicación primero para subir imágenes',
                          });
                          return;
                        }
                        const fd = new FormData();
                        fd.append('files', file);
                        // IMPORTANT: do NOT set Content-Type manually. Axios
                        // auto-sets `multipart/form-data; boundary=...` for FormData bodies.
                        await api.post(`/blog/posts/${post._id}/images`, fd);
                        const r = await api.get(`/blog/posts/${post._id}`);
                        setForm({ ...form, coverImage: r.data.coverImage || '' });
                        setToast?.({ type: 'success', text: 'Imagen subida' });
                      }}
                    />
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
                      <span className="muted small">
                        {form.excerpt.length}/500 caracteres
                      </span>
                    </label>
                    <label>
                      Contenido / Nota principal
                      <textarea
                        className="input"
                        rows={14}
                        value={form.body}
                        onChange={(e) => setForm({ ...form, body: e.target.value })}
                        placeholder="Texto principal. Aquí puedes escribir notas largas, anuncios, tutoriales, fuentes, atribuciones…"
                      />
                    </label>
                    <label>
                      Etiquetas (separadas por coma)
                      <input
                        className="input"
                        type="text"
                        value={form.tags}
                        onChange={(e) => setForm({ ...form, tags: e.target.value })}
                        placeholder="ej. anuncio, tutorial, dream-team, gol, mundial"
                      />
                    </label>
                    <LinksEditor
                      links={form.links || []}
                      onChange={(links) => setForm({ ...form, links })}
                    />
                  </div>
                  <div className="edit-side">
                    <div className="edit-side-card">
                      <h4>📊 Resumen</h4>
                      <ul className="meta-list">
                        <li>
                          <span className="muted">Imágenes</span>
                          <strong>
                            {isCreating ? pendingImages.length : images.length}
                          </strong>
                        </li>
                        <li>
                          <span className="muted">Videos</span>
                          <strong>
                            {isCreating ? pendingVideos.length : videos.length}
                          </strong>
                        </li>
                        <li>
                          <span className="muted">Documentos</span>
                          <strong>
                            {isCreating ? pendingDocs.length : documents.length}
                          </strong>
                        </li>
                        <li>
                          <span className="muted">Links</span>
                          <strong>{links.length}</strong>
                        </li>
                        <li>
                          <span className="muted">Notas</span>
                          <strong>{comments.length}</strong>
                        </li>
                        <li>
                          <span className="muted">Vistas</span>
                          <strong>{post.views || 0}</strong>
                        </li>
                      </ul>
                      <p className="muted small">
                        {isCreating
                          ? 'Puedes arrastrar o seleccionar varios archivos en cada pestaña. Se subirán al guardar la publicación.'
                          : 'Administra archivos en las pestañas 🖼️ / 🎬 / 📎. Todo se guarda de inmediato.'}
                      </p>
                    </div>
                    <div className="edit-side-card">
                      <h4>👤 Autor</h4>
                      <p className="muted small">
                        {post.author?.name || me?.name || '—'}
                        <br />
                        {!isCreating && post.createdAt && (
                          <>
                            Creado {timeAgo(post.createdAt)}
                            <br />
                            Actualizado {timeAgo(post.updatedAt)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'images' && (
                isCreating ? (
                  <PendingUploads
                    kind="images"
                    accept="image/*"
                    files={pendingImages}
                    onChange={setPendingImages}
                    uploadLabel="Subir imágenes"
                  />
                ) : (
                  <AttachmentGallery
                    key={`edit-images-${post._id}-${images.length}`}
                    kind="images"
                    files={images}
                    onAttach={canEdit ? (files) => onAttach(post, 'images', files) : null}
                    onRemove={canEdit ? (fileId) => onRemoveFile(post, 'images', fileId) : null}
                    onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'images', ids) : null}
                    onSetCover={canEdit ? (fileId) => onSetCover(post, fileId) : null}
                    accept="image/*"
                    uploadLabel="Subir imágenes"
                    isCover={(file) => post.coverImage && post.coverImage === file.url}
                    readOnly={!canEdit}
                  />
                )
              )}

              {tab === 'videos' && (
                isCreating ? (
                  <PendingUploads
                    kind="videos"
                    accept="video/*"
                    files={pendingVideos}
                    onChange={setPendingVideos}
                    uploadLabel="Subir videos"
                  />
                ) : (
                  <AttachmentGallery
                    key={`edit-videos-${post._id}-${videos.length}`}
                    kind="videos"
                    files={videos}
                    onAttach={canEdit ? (files) => onAttach(post, 'videos', files) : null}
                    onRemove={canEdit ? (fileId) => onRemoveFile(post, 'videos', fileId) : null}
                    onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'videos', ids) : null}
                    onSetCover={null}
                    accept="video/*"
                    uploadLabel="Subir videos"
                    isCover={null}
                    readOnly={!canEdit}
                  />
                )
              )}

              {tab === 'docs' && (
                isCreating ? (
                  <PendingUploads
                    kind="documents"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z,.csv"
                    files={pendingDocs}
                    onChange={setPendingDocs}
                    uploadLabel="Subir documentos"
                  />
                ) : (
                  <AttachmentGallery
                    key={`edit-docs-${post._id}-${documents.length}`}
                    kind="documents"
                    files={documents}
                    onAttach={canEdit ? (files) => onAttach(post, 'documents', files) : null}
                    onRemove={canEdit ? (fileId) => onRemoveFile(post, 'documents', fileId) : null}
                    onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'documents', ids) : null}
                    onSetCover={null}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z,.csv"
                    uploadLabel="Subir documentos"
                    isCover={null}
                    readOnly={!canEdit}
                  />
                )
              )}
            </div>

            <div className="edit-footer">
              <button
                type="button"
                className="btn ghost"
                onClick={onCancelEdit}
                disabled={busy}
              >
                ↩ Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={onSave}
                disabled={busy}
              >
                {busy
                  ? '⏳ Guardando…'
                  : isCreating
                  ? `✨ Crear publicación${
                      pendingImages.length + pendingVideos.length + pendingDocs.length > 0
                        ? ` y subir ${pendingImages.length + pendingVideos.length + pendingDocs.length} archivo(s)`
                        : ''
                    }`
                  : '💾 Guardar cambios'}
              </button>
            </div>
          </>
        ) : (
          // ============ VIEW MODE ============
          <>
            <div className="tabs">
              <button
                className={`tab ${tab === 'content' ? 'active' : ''}`}
                onClick={() => setTab('content')}
              >
                📝 Contenido
              </button>
              <button
                className={`tab ${tab === 'images' ? 'active' : ''}`}
                onClick={() => setTab('images')}
              >
                🖼️ Imágenes ({images.length})
              </button>
              <button
                className={`tab ${tab === 'videos' ? 'active' : ''}`}
                onClick={() => setTab('videos')}
              >
                🎬 Videos ({videos.length})
              </button>
              <button
                className={`tab ${tab === 'docs' ? 'active' : ''}`}
                onClick={() => setTab('docs')}
              >
                📎 Documentos ({documents.length})
              </button>
              <button
                className={`tab ${tab === 'links' ? 'active' : ''}`}
                onClick={() => setTab('links')}
              >
                🔗 Links ({links.length})
              </button>
              <button
                className={`tab ${tab === 'notes' ? 'active' : ''}`}
                onClick={() => setTab('notes')}
              >
                💬 Notas ({comments.length})
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
                  <div className="muted small">
                    👁 {post.views || 0} vistas · ✍️ {post.author?.name || '—'}
                  </div>
                </div>
              )}

              {tab === 'images' && (
                <AttachmentGallery
                  key={`images-${post._id}-${images.length}`}
                  kind="images"
                  files={images}
                  onAttach={canEdit ? (files) => onAttach(post, 'images', files) : null}
                  onRemove={canEdit ? (fileId) => onRemoveFile(post, 'images', fileId) : null}
                  onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'images', ids) : null}
                  onSetCover={canEdit ? (fileId) => onSetCover(post, fileId) : null}
                  accept="image/*"
                  uploadLabel="Subir imágenes"
                  isCover={(file) => post.coverImage && post.coverImage === file.url}
                  readOnly={!canEdit}
                />
              )}
              {tab === 'videos' && (
                <AttachmentGallery
                  key={`videos-${post._id}-${videos.length}`}
                  kind="videos"
                  files={videos}
                  onAttach={canEdit ? (files) => onAttach(post, 'videos', files) : null}
                  onRemove={canEdit ? (fileId) => onRemoveFile(post, 'videos', fileId) : null}
                  onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'videos', ids) : null}
                  onSetCover={null}
                  accept="video/*"
                  uploadLabel="Subir videos"
                  isCover={null}
                  readOnly={!canEdit}
                />
              )}
              {tab === 'docs' && (
                <AttachmentGallery
                  key={`docs-${post._id}-${documents.length}`}
                  kind="documents"
                  files={documents}
                  onAttach={canEdit ? (files) => onAttach(post, 'documents', files) : null}
                  onRemove={canEdit ? (fileId) => onRemoveFile(post, 'documents', fileId) : null}
                  onBulkRemove={canEdit ? (ids) => onBulkRemove(post, 'documents', ids) : null}
                  onSetCover={null}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z,.csv"
                  uploadLabel="Subir documentos"
                  isCover={null}
                  readOnly={!canEdit}
                />
              )}

              {tab === 'links' && (
                <LinksList
                  links={links}
                  canEdit={canEdit}
                  onAdd={onAddLink}
                  onRemove={onRemoveLink}
                />
              )}

              {tab === 'notes' && (
                <div>
                  {canEdit && (
                    <div className="comment-composer">
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Escribe una nota o comentario interno…"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                      />
                      <button
                        className="btn primary"
                        onClick={submitComment}
                        disabled={busyComment || !commentText.trim()}
                      >
                        {busyComment ? 'Enviando…' : 'Publicar nota'}
                      </button>
                    </div>
                  )}
                  {comments.length === 0 && <p className="muted">Sin notas todavía.</p>}
                  <ul className="comment-list">
                    {comments.map((c) => {
                      const authorId = c.author?._id || c.author;
                      const canDelete =
                        me && (String(me._id) === String(authorId) || me.role === 'admin');
                      return (
                        <li key={c._id} className="comment">
                          <div className="comment-head">
                            <strong>{c.author?.name || c.authorName || 'Usuario'}</strong>
                            <span className="muted small">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p>{c.text}</p>
                          {canDelete && (
                            <button
                              className="btn ghost danger small"
                              onClick={() => onDeleteComment(c._id)}
                            >
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
          </>
        )}
      </div>
    </div>
  );
}

// ============ cover image field — URL + file picker ============
function CoverImageField({ value, onChange, post, canEdit, onUpload }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(f) {
    if (!f) return;
    if (canEdit && onUpload) {
      setUploading(true);
      try {
        await onUpload(f);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    } else {
      // For new posts, use a local object URL as preview; the field is replaced
      // by the uploaded URL after the post is created.
      const localUrl = URL.createObjectURL(f);
      onChange(localUrl);
    }
  }

  function clearCover() {
    onChange('');
  }

  return (
    <div className="cover-field">
      <label className="cover-field-label">
        <span>🖼️ Imagen de portada</span>
        <span className="muted small">
          {canEdit
            ? 'Sube una imagen desde tu computadora o pega una URL'
            : 'Pega una URL; podrás subir después de crear la publicación'}
        </span>
      </label>
      <div className="cover-field-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className={`btn primary ${dragOver ? 'dragging' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          disabled={uploading}
        >
          {uploading ? '⏳ Subiendo…' : '📁 Examinar…'}
        </button>
        <span className="muted small">o</span>
        <input
          type="text"
          className="input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… pega una URL de imagen"
        />
        {value && (
          <button
            type="button"
            className="btn ghost small"
            onClick={clearCover}
            title="Quitar portada"
          >
            ✕
          </button>
        )}
      </div>
      {value && (
        <div className="cover-preview" style={{ backgroundImage: `url(${value})` }}>
          {value.startsWith('blob:') && (
            <div className="cover-preview-note">
              Vista previa local — se subirá al guardar la publicación
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ links editor (form mode) ============
function LinksEditor({ links, onChange }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function add() {
    const u = url.trim();
    if (!u) return;
    onChange([
      ...links,
      { url: u, title: title.trim(), description: description.trim() },
    ]);
    setUrl('');
    setTitle('');
    setDescription('');
  }

  function remove(idx) {
    onChange(links.filter((_, i) => i !== idx));
  }

  return (
    <div className="links-editor">
      <h4>🔗 Links</h4>
      <p className="muted small">
        Agrega links externos (referencias, fuentes, artículos relacionados).
      </p>
      <div className="link-form">
        <input
          type="text"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… URL del link"
        />
        <input
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (opcional)"
        />
        <input
          type="text"
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción corta (opcional)"
        />
        <button
          type="button"
          className="btn primary"
          onClick={add}
          disabled={!url.trim()}
        >
          ＋ Agregar
        </button>
      </div>
      {links.length > 0 && (
        <ul className="link-list edit">
          {links.map((l, i) => (
            <li key={i}>
              <strong>{l.title || l.url}</strong>
              {l.description && <p className="muted small">{l.description}</p>}
              <span className="muted small">{l.url}</span>
              <button
                type="button"
                className="btn ghost danger small"
                onClick={() => remove(i)}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============ links list (view mode) — modal-based add ============
function LinksList({ links, canEdit, onAdd, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function submit() {
    if (!url.trim()) return;
    await onAdd(url.trim(), title.trim(), description.trim());
    setUrl('');
    setTitle('');
    setDescription('');
    setShowAdd(false);
  }

  return (
    <div>
      {canEdit && !showAdd && (
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          ＋ Agregar link
        </button>
      )}
      {showAdd && (
        <div className="link-form">
          <input
            type="text"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… URL del link"
            autoFocus
          />
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
          />
          <input
            type="text"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
          />
          <div className="row">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setShowAdd(false);
                setUrl('');
                setTitle('');
                setDescription('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={!url.trim()}
            >
              ＋ Agregar
            </button>
          </div>
        </div>
      )}
      {links.length === 0 && <p className="muted">Sin links todavía.</p>}
      <ul className="link-list">
        {links.map((l) => (
          <li key={l._id}>
            <a href={l.url} target="_blank" rel="noreferrer">
              <strong>{l.title || l.url}</strong>
            </a>
            {l.description && <p className="muted small">{l.description}</p>}
            <span className="muted small">{l.url}</span>
            {canEdit && (
              <button
                className="btn ghost danger small"
                onClick={() => onRemove(l._id)}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============ pending uploads (new posts only) ============
// local-only file queue — files live in memory until the post is created and saved.
// supports multi-select, drag-drop, lightbox preview, bulk remove, and cover-set.
function PendingUploads({ kind, accept, files, onChange, uploadLabel }) {
  const inputRef = useRef(null);
  const [selected, setSelected] = useState(new Set());
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  function pick() {
    inputRef.current?.click();
  }

  // Reject files that don't match the kind's accept pattern
  function validateFiles(fl) {
    const valid = [];
    const rejected = [];
    for (const f of fl) {
      if (matchesAccept(f, accept)) valid.push(f);
      else rejected.push(f);
    }
    if (rejected.length > 0) {
      setError(
        `${rejected.length} archivo(s) rechazado(s) por tipo (esperado: ${accept}): ` +
          rejected.map((f) => f.name).join(', ')
      );
      setTimeout(() => setError(''), 5000);
    } else {
      setError('');
    }
    return valid;
  }

  function handleFiles(fl) {
    if (!fl || fl.length === 0) return;
    const valid = validateFiles(Array.from(fl));
    if (valid.length === 0) return;
    // Each pending file gets a stable clientId, plus a preview blob URL
    const additions = valid.map((f) => ({
      _clientId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file: f,
      filename: f.name,
      size: f.size,
      mimetype: f.type,
      url: f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : null,
    }));
    onChange([...files, ...additions]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files || []));
  }

  function removeOne(clientId) {
    onChange(files.filter((f) => f._clientId !== clientId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(clientId);
      return next;
    });
  }

  function toggleSelect(clientId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(files.map((f) => f._clientId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function bulkRemove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Quitar ${selected.size} archivo(s) de la cola?`)) return;
    onChange(files.filter((f) => !selected.has(f._clientId)));
    clearSelection();
  }

  function openLightbox(file, idx) {
    const isImg = (file.mimetype || '').startsWith('image/');
    const isVid = (file.mimetype || '').startsWith('video/');
    if (!isImg && !isVid) {
      // Documents: no preview, but show info
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

  useEffect(() => {
    setSelected(new Set());
  }, [files.length]);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.url && f.url.startsWith('blob:')) URL.revokeObjectURL(f.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  return (
    <div>
      {error && <div className="banner error">{error}</div>}
      <div className="banner info">
        📥 <strong>Archivos pendientes:</strong> estos archivos se subirán al
        servidor cuando hagas click en <strong>✨ Crear publicación</strong>.
        Puedes agregar varios a la vez y quitarlos antes de guardar.
      </div>

      <div className="gallery-toolbar">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(Array.from(e.target.files || []));
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <button
          type="button"
          className={`btn primary ${dragOver ? 'dragging' : ''}`}
          onClick={pick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          📁 Examinar… {uploadLabel.replace('Subir ', '')}
        </button>
        <span className="muted small">
          {files.length} {files.length === 1 ? 'archivo' : 'archivos'} · {fmtSize(totalSize)}
        </span>
        <div className="gallery-toolbar-right">
          {files.length > 0 && (
            <>
              {selected.size === 0 ? (
                <button type="button" className="btn ghost small" onClick={selectAll}>
                  ☑️ Seleccionar todos
                </button>
              ) : (
                <>
                  <span className="muted small">{selected.size} seleccionados</span>
                  <button type="button" className="btn ghost small" onClick={clearSelection}>
                    Limpiar
                  </button>
                  <button type="button" className="btn danger small" onClick={bulkRemove}>
                    🗑 Quitar {selected.size}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {dragOver && (
        <div className="drop-zone active">
          📥 Suelta los archivos aquí para agregarlos a la cola
        </div>
      )}

      {files.length === 0 && (
        <div
          className={`empty small drop-target ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p>📎 Sin archivos pendientes.</p>
          <p className="muted small">
            Haz click en <strong>📁 Examinar…</strong> o arrastra varios archivos
            aquí. Se subirán al guardar la publicación.
          </p>
        </div>
      )}

      <div className="gallery-grid">
        {files.map((f, idx) => {
          const isImg = (f.mimetype || '').startsWith('image/');
          const isVid = (f.mimetype || '').startsWith('video/');
          const isSel = selected.has(f._clientId);
          return (
            <div
              key={f._clientId}
              className={`gallery-tile ${isSel ? 'selected' : ''}`}
            >
              <button
                type="button"
                className={`gallery-select ${isSel ? 'on' : ''}`}
                onClick={() => toggleSelect(f._clientId)}
                title={isSel ? 'Quitar de selección' : 'Seleccionar'}
                aria-label="Seleccionar"
              >
                {isSel ? '✓' : ''}
              </button>
              <span className="cover-badge pending">⏳ Pendiente</span>

              <div
                className="gallery-preview"
                onClick={() => (isImg || isVid) && openLightbox(f, idx)}
              >
                {isImg ? (
                  <img src={f.url} alt={f.filename} />
                ) : isVid ? (
                  <>
                    <video src={f.url} preload="metadata" />
                    <span className="video-play-icon">▶</span>
                  </>
                ) : (
                  <div className="doc-tile">
                    <span className="file-icon-big">
                      {fileIcon(f.mimetype, f.filename)}
                    </span>
                    <span className="file-name-sm">{f.filename}</span>
                    <span className="muted small">{fmtSize(f.size)}</span>
                  </div>
                )}
              </div>

              <div className="gallery-meta">
                <span className="gallery-filename" title={f.filename}>
                  {f.filename.length > 24 ? f.filename.slice(0, 21) + '…' : f.filename}
                </span>
                <span className="muted small">{fmtSize(f.size)}</span>
              </div>

              <div className="gallery-actions">
                <button
                  type="button"
                  className="btn ghost danger small"
                  onClick={() => removeOne(f._clientId)}
                  title="Quitar de la cola"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
                {fmtSize(lightboxFile.size)} · {lightboxIdx + 1}/{files.length} · ⏳ pendiente
              </span>
            </div>
          </div>
        </div>
      )}
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
  readOnly,
}) {
  const inputRef = useRef(null);
  const [selected, setSelected] = useState(new Set());
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function pick() {
    if (readOnly) return;
    inputRef.current?.click();
  }

  async function handleFiles(fl) {
    if (!fl || fl.length === 0 || !onAttach) return;
    setUploading(true);
    try {
      await onAttach(fl);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onChange(e) {
    await handleFiles(Array.from(e.target.files || []));
  }

  async function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    await handleFiles(Array.from(e.dataTransfer.files || []));
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

  // reset selection when files change
  useEffect(() => {
    setSelected(new Set());
  }, [files.length]);

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  return (
    <div>
      {/* toolbar */}
      <div className="gallery-toolbar">
        {!readOnly && (
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            style={{ display: 'none' }}
            onChange={onChange}
          />
        )}
        <button
          type="button"
          className={`btn primary ${dragOver ? 'dragging' : ''}`}
          onClick={pick}
          disabled={uploading || readOnly}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? '⏳ Subiendo…' : `📁 Examinar… ${uploadLabel.replace('Subir ', '')}`}
        </button>
        <span className="muted small">
          {files.length} {files.length === 1 ? 'archivo' : 'archivos'} · {fmtSize(totalSize)}
        </span>
        <div className="gallery-toolbar-right">
          {files.length > 0 && (
            <>
              {selected.size === 0 ? (
                !readOnly && (
                  <button className="btn ghost small" onClick={selectAll}>
                    ☑️ Seleccionar todos
                  </button>
                )
              ) : (
                <>
                  <span className="muted small">{selected.size} seleccionados</span>
                  <button className="btn ghost small" onClick={clearSelection}>
                    Limpiar
                  </button>
                  {!readOnly && (
                    <button className="btn danger small" onClick={bulkDelete}>
                      🗑 Eliminar {selected.size}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {dragOver && (
        <div className="drop-zone active">
          📥 Suelta los archivos aquí para subirlos
        </div>
      )}

      {files.length === 0 && (
        <div
          className={`empty small drop-target ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!readOnly) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p>📎 Sin archivos.</p>
          {!readOnly && (
            <p className="muted small">
              Haz click en <strong>📁 Examinar…</strong> o arrastra varios archivos aquí
              para subirlos de una vez.
            </p>
          )}
        </div>
      )}

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
              {!readOnly && (
                <button
                  type="button"
                  className={`gallery-select ${isSel ? 'on' : ''}`}
                  onClick={() => toggleSelect(f._id)}
                  title={isSel ? 'Quitar de selección' : 'Seleccionar'}
                  aria-label="Seleccionar"
                >
                  {isSel ? '✓' : ''}
                </button>
              )}

              {cover && <span className="cover-badge">⭐ Portada</span>}

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
                    <span className="file-icon-big">
                      {fileIcon(f.mimetype, f.filename)}
                    </span>
                    <span className="file-name-sm">{f.filename}</span>
                    <span className="muted small">{fmtSize(f.size)}</span>
                  </div>
                )}
              </div>

              <div className="gallery-meta">
                <span className="gallery-filename" title={f.filename}>
                  {f.filename.length > 24 ? f.filename.slice(0, 21) + '…' : f.filename}
                </span>
                <span className="muted small">{fmtSize(f.size)}</span>
              </div>

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
                {!readOnly && onRemove && (
                  <button
                    type="button"
                    className="btn ghost danger small"
                    onClick={() => onRemove(f._id)}
                    title="Eliminar"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
  const [q, setQ] = useState('');

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

  const ICON_OPTIONS = ['📝', '📰', '🚀', '💡', '🔧', '🎨', '📊', '⚽', '🎵', '🎬', '📚', '✨', '🔥', '💼', '🌐', '💻', '🎮', '🍔', '✈️', '🌍'];

  const filtered = categories.filter((c) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>⚙️ Categorías del blog</h2>
          <button className="close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {error && <div className="banner error">{error}</div>}

        <div className="form">
          <h3>{editingId ? '✏️ Editar categoría' : '＋ Nueva categoría'}</h3>
          <div className="row two">
            <label>
              Nombre *
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
                  setError('');
                }}
              >
                Cancelar edición
              </button>
            )}
            <button type="button" className="btn primary" onClick={save}>
              {editingId ? '💾 Guardar cambios' : '✨ Crear categoría'}
            </button>
          </div>
        </div>

        <hr />

        <div className="cat-mgr-list">
          <input
            type="text"
            className="input"
            placeholder="🔍 Buscar categoría…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="muted small">
            {filtered.length} de {categories.length} categorías
          </span>
        </div>

        <ul className="category-list">
          {filtered.length === 0 && (
            <li className="muted">No hay categorías que coincidan.</li>
          )}
          {filtered.map((c) => (
            <li key={c._id}>
              <span
                className="cat-badge"
                style={{
                  background: (c.color || '#FF6A00') + '22',
                  color: c.color || '#FF6A00',
                }}
              >
                {c.icon} {c.name}
              </span>
              {c.description && (
                <span className="muted small">{c.description}</span>
              )}
              <span className="muted small">{c.postCount || 0} publicaciones</span>
              <div className="actions">
                <button className="btn ghost small" onClick={() => startEdit(c)}>
                  ✏️ Editar
                </button>
                <button
                  className="btn ghost danger small"
                  onClick={() => remove(c)}
                >
                  🗑 Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
