import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { Post, BlogCategory } from '../models/Post.js';

// ===== helpers =====
const idOf = (field) => {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (field._id) return field._id.toString();
  return field.toString();
};

// Builds a stable public URL for an uploaded file. Mirrors task uploads.
function publicFileUrl(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/uploads/${filename}`;
}

// Persists a multer-memory file to disk and returns the file metadata
// record that gets stored on the post document.
function persistAndBuildFile(req, f, kind) {
  const UPLOAD_DIR = path.resolve('uploads');
  let filename = f.filename;
  let fullPath = f.path;
  if (f.buffer && !f.path) {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const ts = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const safe = (f.originalname || 'archivo')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    filename = `${ts}_${safe}`;
    fullPath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(fullPath, f.buffer);
  }
  return {
    url: publicFileUrl(req, filename),
    filename,
    mimetype: f.mimetype,
    size: f.size,
    uploadedBy: req.user._id,
  };
}

// Slug collision suffix
async function uniqueSlug(base, excludeId = null) {
  let candidate = base || 'post';
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const existing = await Post.findOne(q).select('_id').lean();
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// ===== categories =====
export async function listCategories(_req, res, next) {
  try {
    const cats = await BlogCategory.find().sort({ name: 1 }).lean();
    // attach post count for each
    const counts = await Post.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json(
      cats.map((c) => ({ ...c, postCount: map.get(String(c._id)) || 0 }))
    );
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const { name, description, color, icon } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ msg: 'Nombre requerido' });
    const slugBase = BlogCategory.slugify(name);
    const slug = await uniqueCategorySlug(slugBase);
    const cat = await BlogCategory.create({
      name: name.trim(),
      slug,
      description: (description || '').trim(),
      color: color || '#FF6A00',
      icon: icon || '📝',
      createdBy: req.user._id,
    });
    res.status(201).json(cat);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ msg: 'Ya existe una categoría con ese nombre' });
    next(err);
  }
}

async function uniqueCategorySlug(base, excludeId = null) {
  let candidate = base || 'categoria';
  let n = 1;
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const existing = await BlogCategory.findOne(q).select('_id').lean();
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const cat = await BlogCategory.findById(id);
    if (!cat) return res.status(404).json({ msg: 'Categoría no encontrada' });
    const { name, description, color, icon } = req.body || {};
    if (name && name.trim() !== cat.name) {
      cat.name = name.trim();
      cat.slug = await uniqueCategorySlug(BlogCategory.slugify(name), cat._id);
    }
    if (description !== undefined) cat.description = (description || '').trim();
    if (color) cat.color = color;
    if (icon) cat.icon = icon;
    await cat.save();
    res.json(cat);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ msg: 'Nombre duplicado' });
    next(err);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const count = await Post.countDocuments({ category: id });
    if (count > 0) {
      return res.status(409).json({
        msg: `No se puede eliminar: hay ${count} publicación(es) usando esta categoría`,
      });
    }
    const cat = await BlogCategory.findByIdAndDelete(id);
    if (!cat) return res.status(404).json({ msg: 'Categoría no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ===== posts =====

// Public list (published only). Used by the public site.
export async function listPublicPosts(req, res, next) {
  try {
    const { category, tag, q, limit = 20, skip = 0 } = req.query;
    const filter = { status: 'publicado' };
    if (category) {
      if (mongoose.isValidObjectId(category)) filter.category = category;
      else {
        const c = await BlogCategory.findOne({ slug: category }).select('_id').lean();
        if (c) filter.category = c._id;
        else return res.json({ items: [], total: 0 });
      }
    }
    if (tag) filter.tags = tag;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }, { body: rx }];
    }
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const sk = parseInt(skip, 10) || 0;
    const [items, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(sk)
        .limit(lim)
        .populate('category', 'name slug color icon')
        .populate('author', 'name email')
        .select('-comments -documents.body') // keep payload light for public
        .lean(),
      Post.countDocuments(filter),
    ]);
    res.json({ items, total });
  } catch (err) {
    next(err);
  }
}

// Single public post by slug — increments views
export async function getPublicPostBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const post = await Post.findOneAndUpdate(
      { slug, status: 'publicado' },
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('category', 'name slug color icon')
      .populate('author', 'name email')
      .lean();
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.json(post);
  } catch (err) {
    next(err);
  }
}

// Admin list — all statuses, with filters
export async function listPosts(req, res, next) {
  try {
    const { status, category, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }];
    }
    const items = await Post.find(filter)
      .sort({ updatedAt: -1 })
      .populate('category', 'name slug color icon')
      .populate('author', 'name email')
      .lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function getPost(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id)
      .populate('category', 'name slug color icon')
      .populate('author', 'name email')
      .populate('comments.author', 'name email')
      .lean();
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.json(post);
  } catch (err) {
    next(err);
  }
}

export async function createPost(req, res, next) {
  try {
    const {
      title,
      excerpt,
      summary,
      body,
      category,
      tags,
      status,
      coverImage,
      links,
    } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ msg: 'Título requerido' });
    if (!category || !mongoose.isValidObjectId(category)) {
      return res.status(400).json({ msg: 'Categoría requerida' });
    }
    const cat = await BlogCategory.findById(category).select('_id').lean();
    if (!cat) return res.status(400).json({ msg: 'Categoría inválida' });

    const slug = await uniqueSlug(Post.slugify(title));
    const post = await Post.create({
      title: title.trim(),
      slug,
      excerpt: (excerpt || '').trim(),
      summary: (summary || '').trim().slice(0, 400),
      body: body || '',
      category: cat._id,
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
      status: status === 'publicado' ? 'publicado' : 'borrador',
      publishedAt: status === 'publicado' ? new Date() : null,
      coverImage: coverImage || '',
      links: Array.isArray(links)
        ? links
            .filter((l) => l && l.url)
            .map((l) => ({
              url: String(l.url).trim(),
              title: (l.title || '').trim(),
              description: (l.description || '').trim().slice(0, 500),
              addedBy: req.user._id,
            }))
        : [],
      author: req.user._id,
    });
    const populated = await Post.findById(post._id)
      .populate('category', 'name slug color icon')
      .populate('author', 'name email')
      .lean();
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
}

export async function updatePost(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });

    const { title, excerpt, summary, body, category, tags, status, coverImage, links } = req.body || {};
    if (title !== undefined) post.title = title.trim();
    if (title && Post.slugify(title) !== post.slug) {
      post.slug = await uniqueSlug(Post.slugify(title), post._id);
    }
    if (excerpt !== undefined) post.excerpt = (excerpt || '').trim();
    if (summary !== undefined) post.summary = (summary || '').trim().slice(0, 400);
    if (body !== undefined) post.body = body || '';
    if (coverImage !== undefined) post.coverImage = coverImage || '';
    if (category !== undefined) {
      if (!mongoose.isValidObjectId(category)) return res.status(400).json({ msg: 'Categoría inválida' });
      const cat = await BlogCategory.findById(category).select('_id').lean();
      if (!cat) return res.status(400).json({ msg: 'Categoría inválida' });
      post.category = cat._id;
    }
    if (tags !== undefined) {
      post.tags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
    }
    if (links !== undefined) {
      post.links = Array.isArray(links)
        ? links
            .filter((l) => l && l.url)
            .map((l) => ({
              url: String(l.url).trim(),
              title: (l.title || '').trim(),
              description: (l.description || '').trim().slice(0, 500),
              addedBy: req.user._id,
            }))
        : [];
    }
    if (status !== undefined) {
      const prev = post.status;
      post.status = status === 'publicado' ? 'publicado' : 'borrador';
      if (post.status === 'publicado' && prev !== 'publicado') {
        post.publishedAt = new Date();
      }
      if (post.status === 'borrador') {
        post.publishedAt = null;
      }
    }
    await post.save();
    const populated = await Post.findById(post._id)
      .populate('category', 'name slug color icon')
      .populate('author', 'name email')
      .lean();
    res.json(populated);
  } catch (err) {
    next(err);
  }
}

export async function deletePost(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findByIdAndDelete(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ===== attachments =====
export async function addImages(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const allFiles = req.files || [];
    const files = allFiles.filter((f) => /^image\//.test(f.mimetype));
    if (allFiles.length && files.length === 0) {
      return res.status(400).json({ msg: 'Solo se permiten imágenes (jpg, png, webp, gif)' });
    }
    if (files.length === 0) return res.status(400).json({ msg: 'Sin archivos' });
    const additions = files.map((f) => persistAndBuildFile(req, f, 'image'));
    const post = await Post.findByIdAndUpdate(
      id,
      { $push: { images: { $each: additions } } },
      { new: true }
    ).populate('category', 'name slug color icon');
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.status(201).json(post.images);
  } catch (err) {
    next(err);
  }
}

export async function addVideos(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const allFiles = req.files || [];
    const files = allFiles.filter((f) => /^video\//.test(f.mimetype));
    if (allFiles.length && files.length === 0) {
      return res.status(400).json({ msg: 'Solo se permiten videos (mp4, webm, mov)' });
    }
    if (files.length === 0) return res.status(400).json({ msg: 'Sin archivos' });
    const additions = files.map((f) => persistAndBuildFile(req, f, 'video'));
    const post = await Post.findByIdAndUpdate(
      id,
      { $push: { videos: { $each: additions } } },
      { new: true }
    ).populate('category', 'name slug color icon');
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.status(201).json(post.videos);
  } catch (err) {
    next(err);
  }
}

export async function addDocuments(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ msg: 'Sin archivos' });
    const additions = files.map((f) => persistAndBuildFile(req, f, 'document'));
    const post = await Post.findByIdAndUpdate(
      id,
      { $push: { documents: { $each: additions } } },
      { new: true }
    ).populate('category', 'name slug color icon');
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    res.status(201).json(post.documents);
  } catch (err) {
    next(err);
  }
}

export async function deleteFile(req, res, next) {
  try {
    const { id, kind, fileId } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    const allowed = ['images', 'videos', 'documents'];
    if (!allowed.includes(kind)) return res.status(400).json({ msg: 'Tipo inválido' });
    const idx = post[kind].findIndex((f) => String(f._id) === String(fileId));
    if (idx === -1) return res.status(404).json({ msg: 'Archivo no encontrado' });
    const removed = post[kind][idx];
    // best-effort: remove file from disk
    try {
      if (removed.filename) {
        const fp = path.resolve('uploads', removed.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    } catch (_) {
      /* ignore */
    }
    post[kind].splice(idx, 1);
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ===== links =====
export async function addLink(req, res, next) {
  try {
    const { id } = req.params;
    const { url, title, description } = req.body || {};
    if (!url || !url.trim()) return res.status(400).json({ msg: 'URL requerida' });
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    post.links.push({
      url: url.trim(),
      title: (title || '').trim(),
      description: (description || '').trim().slice(0, 500),
      addedBy: req.user._id,
    });
    await post.save();
    res.status(201).json(post.links[post.links.length - 1]);
  } catch (err) {
    next(err);
  }
}

export async function deleteLink(req, res, next) {
  try {
    const { id, linkId } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    const idx = post.links.findIndex((l) => String(l._id) === String(linkId));
    if (idx === -1) return res.status(404).json({ msg: 'Link no encontrado' });
    post.links.splice(idx, 1);
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ===== comments / notes =====
export async function addComment(req, res, next) {
  try {
    const { id } = req.params;
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ msg: 'Comentario vacío' });
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    post.comments.push({
      text: text.trim().slice(0, 2000),
      author: req.user._id,
      authorName: req.user.name || req.user.email || '',
    });
    await post.save();
    const c = post.comments[post.comments.length - 1];
    res.status(201).json({ ...c.toObject(), author: { _id: req.user._id, name: req.user.name, email: req.user.email } });
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'ID inválido' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ msg: 'Publicación no encontrada' });
    const idx = post.comments.findIndex((c) => String(c._id) === String(commentId));
    if (idx === -1) return res.status(404).json({ msg: 'Comentario no encontrado' });
    // only author of comment OR admin OR post author can delete
    const c = post.comments[idx];
    const isOwner = idOf(c.author) === idOf(req.user._id);
    const isAdmin = req.user.role === 'admin';
    const isPostAuthor = idOf(post.author) === idOf(req.user._id);
    if (!isOwner && !isAdmin && !isPostAuthor) {
      return res.status(403).json({ msg: 'Sin permisos' });
    }
    post.comments.splice(idx, 1);
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}