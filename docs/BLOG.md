# Blog

Editor completo con galerías multi-archivo por publicación.

## URLs
- **Admin** (`/blog`): lista + crear/editar/borrar
- **Público** (`/public/blog`): lista con cards + búsqueda
- **Público detalle** (`/public/blog/:slug`): lectura + comentarios

## Modelo Post
Ver `docs/DATA-MODEL.md` → Post.

Adjuntos:
- `coverImage` (string URL, una sola)
- `images[]` — galería
- `videos[]` — galería
- `documents[]` — galería
- `links[]` — referencias externas
- `comments[]` — comentarios (con author, text, createdAt)

## API
- `GET    /api/blog/posts` — listar (auth) con filtros status/category/q
- `POST   /api/blog/posts` — crear
- `PUT    /api/blog/posts/:id` — actualizar
- `DELETE /api/blog/posts/:id` — eliminar
- `POST   /api/blog/posts/:id/images` — upload imágenes (multipart, `files` plural)
- `POST   /api/blog/posts/:id/videos` — upload videos
- `POST   /api/blog/posts/:id/documents` — upload documentos
- `DELETE /api/blog/posts/:id/files/:kind/:fileId` — borrar adjunto
- `PUT    /api/blog/posts/:id` (con `coverImage`) — marcar portada
- `POST   /api/blog/posts/:id/comments` — comentar
- `DELETE /api/blog/posts/:id/comments/:commentId` — borrar comentario
- `POST   /api/blog/posts/:id/links` — agregar link externo
- `DELETE /api/blog/posts/:id/links/:linkId` — quitar link

### Públicas
- `GET /api/blog/public/posts?page=&category=&q=` — lista paginada
- `GET /api/blog/public/posts/:slug` — detalle (incrementa views)
- `GET /api/blog/categories` — todas las categorías (público para blog público)

## Editor (`/blog`)

### Vista
- Tabs: Contenido, Imágenes, Videos, Documentos, Links, Notas
- Galería con multi-select, lightbox, drag-drop, bulk delete, set cover

### Edición (mismo modal, modo inline)
- **4 tabs**: Contenido, Imágenes, Videos, Documentos
- Pestaña Contenido: cover picker, excerpt, body, tags, links editor + sidebar de resumen
- Pestañas de archivos: `AttachmentGallery` completa con multi-select, lightbox, drag-drop, bulk delete, set cover — **los cambios se guardan al instante** al subir/borrar
- Para posts ya guardados

### Creación
- Mismas 4 tabs
- Pestañas de archivos usan `PendingUploads` — cola local con la misma UX (multi-select, lightbox, drag-drop, bulk remove, badge azul "Pendiente")
- Al hacer click en "Crear publicación y subir N archivo(s)", primero crea el post, luego sube los pendientes en batch a `/api/blog/posts/:id/{images|videos|documents}`
- Validación de tipo MIME (matches accept pattern)

## Categorías
- Admin puede CRUD desde ⚙️ Categorías en la página `/blog`
- Iconos: 20 emojis predefinidos
- Color customizable (hex)
- No se puede eliminar si tiene publicaciones

## Permisos
- Admin: CRUD total
- Member: solo posts donde son `author` (own)
- Anónimo: solo lectura de publicados vía `/public/blog`
