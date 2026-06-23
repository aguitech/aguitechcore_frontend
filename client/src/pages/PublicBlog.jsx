import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import '../styles/public.css';

// =============================================================
// PUBLIC BLOG — accessible at /blog and /blog/:slug WITHOUT login
// The API endpoints /api/blog/public/* are unauthenticated.
// =============================================================

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

// ----- listing -----
export function PublicBlogList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const category = searchParams.get('category') || '';
  const q = searchParams.get('q') || '';
  const skip = parseInt(searchParams.get('skip') || '0', 10);

  useEffect(() => {
    // categories are public too
    api
      .get('/blog/categories')
      .then((r) => setCategories(r.data))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    params.set('skip', String(skip));
    params.set('limit', '12');
    api
      .get(`/blog/public/posts?${params.toString()}`)
      .then((r) => {
        setPosts(r.data.items);
        setTotal(r.data.total);
      })
      .catch((err) => setError(err.response?.data?.msg || 'Error al cargar publicaciones'))
      .finally(() => setLoading(false));
  }, [category, q, skip]);

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'skip') next.delete('skip');
    setSearchParams(next);
  }

  return (
    <PublicShell>
      <header className="public-hero">
        <h1>
          <span className="hero-icon">📰</span> Blog
        </h1>
        <p>Historias, anuncios y notas de la comunidad.</p>
      </header>

      <div className="public-filters">
        <input
          type="search"
          placeholder="🔍 Buscar publicación..."
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          className="input"
        />
        <div className="cat-chips">
          <button
            className={`chip ${!category ? 'active' : ''}`}
            onClick={() => setParam('category', '')}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c._id}
              className={`chip ${category === c._id || category === c.slug ? 'active' : ''}`}
              onClick={() => setParam('category', c._id)}
              style={
                category === c._id || category === c.slug
                  ? { background: c.color, color: '#fff', borderColor: c.color }
                  : { borderColor: c.color, color: c.color }
              }
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {loading && <div className="muted center pad">Cargando...</div>}

      {!loading && posts.length === 0 && (
        <div className="empty-public">
          <span style={{ fontSize: 64 }}>📭</span>
          <p>Aún no hay publicaciones en esta categoría.</p>
        </div>
      )}

      <div className="public-grid">
        {posts.map((p) => (
          <Link key={p._id} to={`/public/blog/${p.slug}`} className="public-card">
            {p.coverImage ? (
              <div className="public-card-cover" style={{ backgroundImage: `url(${p.coverImage})` }} />
            ) : (
              <div className="public-card-cover placeholder">
                <span>{p.category?.icon || '📝'}</span>
              </div>
            )}
            <div className="public-card-body">
              <span
                className="badge"
                style={{ background: (p.category?.color || '#FF6A00') + '22', color: p.category?.color || '#FF6A00' }}
              >
                {p.category?.icon} {p.category?.name}
              </span>
              <h2>{p.title}</h2>
              {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
              <div className="public-card-footer">
                <span>{p.author?.name || 'Equipo'}</span>
                <span>{fmtDate(p.publishedAt || p.createdAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {total > posts.length + skip && (
        <div className="public-pagination">
          {skip > 0 && (
            <button
              className="btn ghost"
              onClick={() => setParam('skip', String(Math.max(0, skip - 12)))}
            >
              ← Anteriores
            </button>
          )}
          <span className="muted small">
            Mostrando {skip + 1}-{Math.min(skip + posts.length, total)} de {total}
          </span>
          {skip + posts.length < total && (
            <button
              className="btn ghost"
              onClick={() => setParam('skip', String(skip + 12))}
            >
              Siguientes →
            </button>
          )}
        </div>
      )}
    </PublicShell>
  );
}

// ----- single post -----
export function PublicBlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIdx, setLightboxIdx] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/blog/public/posts/${slug}`)
      .then((r) => setPost(r.data))
      .catch((err) => {
        if (err.response?.status === 404) setError('Publicación no encontrada');
        else setError(err.response?.data?.msg || 'Error al cargar');
      })
      .finally(() => setLoading(false));
    window.scrollTo(0, 0);
  }, [slug]);

  // lightbox keyboard nav
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e) {
      if (e.key === 'Escape') setLightboxIdx(null);
      else if (e.key === 'ArrowLeft' && post?.images) {
        setLightboxIdx((i) => (i > 0 ? i - 1 : post.images.length - 1));
      } else if (e.key === 'ArrowRight' && post?.images) {
        setLightboxIdx((i) => (i < post.images.length - 1 ? i + 1 : 0));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, post]);

  if (loading) {
    return (
      <PublicShell>
        <div className="muted center pad">Cargando...</div>
      </PublicShell>
    );
  }
  if (error || !post) {
    return (
      <PublicShell>
        <div className="empty-public">
          <span style={{ fontSize: 64 }}>😕</span>
          <p>{error || 'Publicación no encontrada'}</p>
          <Link to="/public/blog" className="btn primary">← Volver al blog</Link>
        </div>
      </PublicShell>
    );
  }

  const images = post.images || [];
  const videos = post.videos || [];
  const documents = post.documents || [];
  const links = post.links || [];
  const lightboxImage = lightboxIdx !== null ? images[lightboxIdx] : null;

  return (
    <PublicShell>
      <article className="public-post">
        <Link to="/public/blog" className="back-link">← Volver al blog</Link>
        <header>
          <div className="post-meta">
            <span
              className="badge"
              style={{ background: (post.category?.color || '#FF6A00') + '22', color: post.category?.color || '#FF6A00' }}
            >
              {post.category?.icon} {post.category?.name}
            </span>
            <span className="muted small">{fmtDate(post.publishedAt || post.createdAt)}</span>
            <span className="muted small">· {post.author?.name || 'Equipo'}</span>
          </div>
          <h1>{post.title}</h1>
          {post.excerpt && <p className="lead">{post.excerpt}</p>}
        </header>

        {post.coverImage && (
          <div className="public-cover" style={{ backgroundImage: `url(${post.coverImage})` }} />
        )}

        {post.body && <pre className="post-body-text">{post.body}</pre>}

        {/* tags */}
        {post.tags?.length > 0 && (
          <div className="tags">
            {post.tags.map((t, i) => (
              <span key={i} className="tag">#{t}</span>
            ))}
          </div>
        )}

        {/* images gallery — clickable, opens lightbox */}
        {images.length > 0 && (
          <section className="post-section">
            <h3>
              📸 Galería · {images.length} {images.length === 1 ? 'imagen' : 'imágenes'}
            </h3>
            <div className="public-gallery-grid">
              {images.map((f, idx) => (
                <button
                  type="button"
                  key={f._id}
                  className="public-gallery-tile"
                  onClick={() => setLightboxIdx(idx)}
                  aria-label={`Ver imagen ${idx + 1}`}
                >
                  <img src={f.url} alt={f.filename} loading="lazy" />
                  <span className="muted small public-gallery-name">{f.filename}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* videos */}
        {videos.length > 0 && (
          <section className="post-section">
            <h3>🎬 Videos · {videos.length}</h3>
            <div className="public-videos-grid">
              {videos.map((f) => (
                <div key={f._id} className="public-video-card">
                  <video src={f.url} controls preload="metadata" />
                  <span className="muted small">{f.filename} · {fmtSize(f.size)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* documents */}
        {documents.length > 0 && (
          <section className="post-section">
            <h3>📎 Documentos · {documents.length}</h3>
            <ul className="public-doc-list">
              {documents.map((f) => (
                <li key={f._id}>
                  <a href={f.url} target="_blank" rel="noreferrer" download>
                    📄 {f.filename} <span className="muted small">({fmtSize(f.size)})</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* external links */}
        {links.length > 0 && (
          <section className="post-section">
            <h3>🔗 Links · {links.length}</h3>
            <ul className="public-link-list">
              {links.map((l) => (
                <li key={l._id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="public-link-card"
                  >
                    <strong>{l.title || l.url}</strong>
                    {l.description && <p className="muted small">{l.description}</p>}
                    <span className="muted small">{isExternal(l.url) ? l.url : ''}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="public-post-footer">
          <Link to="/public/blog" className="btn ghost">← Volver al blog</Link>
          <span className="muted small">👁 {post.views || 0} vistas</span>
        </footer>
      </article>

      {/* lightbox */}
      {lightboxImage && (
        <div className="public-lightbox-backdrop" onClick={() => setLightboxIdx(null)}>
          <div className="public-lightbox" onClick={(e) => e.stopPropagation()}>
            <button
              className="public-lightbox-close"
              onClick={() => setLightboxIdx(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
            {images.length > 1 && (
              <>
                <button
                  className="public-lightbox-nav public-lightbox-prev"
                  onClick={() => setLightboxIdx((i) => (i > 0 ? i - 1 : images.length - 1))}
                  aria-label="Anterior"
                >
                  ‹
                </button>
                <button
                  className="public-lightbox-nav public-lightbox-next"
                  onClick={() => setLightboxIdx((i) => (i < images.length - 1 ? i + 1 : 0))}
                  aria-label="Siguiente"
                >
                  ›
                </button>
              </>
            )}
            <img src={lightboxImage.url} alt={lightboxImage.filename} />
            <div className="public-lightbox-footer">
              <strong>{lightboxImage.filename}</strong>
              <span className="muted small">
                {fmtSize(lightboxImage.size)} · {lightboxIdx + 1}/{images.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </PublicShell>
  );
}

// ----- public chrome (no auth, branded header/footer) -----
function PublicShell({ children }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/" className="public-brand">
          <span className="public-brand-mark">⚡</span>
          <span>Aguitech</span>
        </Link>
        <nav className="public-nav">
          <Link to="/public/blog" className="navlink">Blog</Link>
          <a href="https://sxxysecret.com/dashboard" className="navlink">Iniciar sesión</a>
        </nav>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <p>© {new Date().getFullYear()} Aguitech — Hecho con 💚 desde México.</p>
      </footer>
    </div>
  );
}