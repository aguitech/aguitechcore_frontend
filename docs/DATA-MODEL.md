# Modelo de datos

13 modelos MongoDB. Mongoose con timestamps (`createdAt`, `updatedAt`).

## User
```js
{
  name: String (required),
  email: String (required, unique, lowercase),
  password: String (required, bcrypt via pre-save hook),
  role: 'admin' | 'member' (default: 'member'),
  avatar: String (URL),
  active: Boolean (default: true),
  apiKey: String (hashed, for MCP server auth),
  lastLogin: Date,
}
```
⚠️ **Gotcha:** `findByIdAndUpdate({password})` NO corre `pre('save')` → password guardado en plaintext. Usar `findById() + save()` para password.

## Client
```js
{
  name: String (required),
  email: String,
  phone: String,
  company: String,
  notes: String,
  owner: ObjectId<User>,
  status: 'active' | 'inactive' | 'prospect' (default: 'active'),
  tags: [String],
}
```

## Project
```js
{
  title: String (required),
  description: String,
  client: ObjectId<Client>,
  owner: ObjectId<User>,
  members: [ObjectId<User>],
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled',
  startDate: Date,
  endDate: Date,
  budget: Number,
  tags: [String],
}
```

## Task
```js
{
  title: String (required),
  description: String,
  status: 'pendiente' | 'en_curso' | 'hecho' (default: 'pendiente'),
  priority: 'low' | 'medium' | 'high' | 'urgent' (default: 'medium'),
  project: ObjectId<Project>,
  client: ObjectId<Client>,
  assignee: ObjectId<User>,
  owner: ObjectId<User>,
  dueDate: Date,
  completedAt: Date,
  tags: [String],
  images: [Attachment],
  documents: [Attachment],
}
```

## Post (Blog)
```js
{
  title: String (required),
  slug: String (auto from title, unique),
  excerpt: String (max 500),
  body: String,
  coverImage: String (URL),
  category: ObjectId<Category>,
  tags: [String],
  status: 'borrador' | 'publicado' (default: 'borrador'),
  author: ObjectId<User>,
  publishedAt: Date,
  views: Number (default: 0),
  images: [Attachment],
  videos: [Attachment],
  documents: [Attachment],
  links: [{ url, title, description }],
  comments: [{ author, text, createdAt }],
}
```

## Category
```js
{
  name: String (required, unique),
  slug: String (auto),
  icon: String (emoji, default: '📝'),
  color: String (hex, default: '#FF6A00'),
  description: String,
  creator: ObjectId<User>,
}
```

## Conversation (Chat)
```js
{
  participants: [{ user: ObjectId<User>, lastRead: Date }],
  type: 'direct' | 'group',
  name: String (group only),
  lastMessage: Date,
  lastMessagePreview: String,
}
```

## Message
```js
{
  conversation: ObjectId<Conversation>,
  sender: ObjectId<User>,
  text: String,
  attachments: [Attachment],
  readBy: [ObjectId<User>],
  edited: Boolean,
}
```

## Appointment
```js
{
  customerName: String (required),
  customerEmail: String,
  customerPhone: String,
  subject: String (required),
  description: String,
  startsAt: Date (required),
  endsAt: Date (required),
  durationMin: Number (computed),
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
  assignedTo: ObjectId<User>,
  location: String ('Google Meet' | 'Zoom' | 'Presencial' | 'Teléfono' | 'Manual'),
  staffNotes: String,
  source: 'public' | 'admin' (default: 'admin'),
}
```
⚠️ **Conflict detection:** 409 si solapan dos citas con el mismo `assignedTo`.

## Notification
```js
{
  recipient: ObjectId<User> (required, indexed),
  type: String (required, indexed): 'chat.message' | 'task.assigned' | 'task.completed' | 'appointment.created' | 'appointment.status_changed' | 'post.commented' | 'client.assigned' | ...,
  title: String (required),
  body: String,
  link: String (URL path),
  sourceType: String (model name),
  sourceId: ObjectId,
  actor: ObjectId<User>,
  actorName: String (denormalized for fast list),
  read: Boolean (default: false, indexed),
  meta: Mixed,
  createdAt: Date (TTL 90 days),
}
```

## AuditLog
```js
{
  actor: ObjectId<User> (required, indexed),
  actorName: String (denormalized),
  actorRole: 'admin' | 'member',
  action: String (dotted, required, indexed): 'task.create' | 'auth.login' | 'appointment.update' | ...,
  category: String (first segment of action, indexed): 'task' | 'auth' | 'chat' | 'appointment' | 'post' | 'client' | 'project' | 'user' | 'admin',
  targetType: String (model name),
  targetId: ObjectId,
  targetLabel: String (human-readable: post title, task title, customer name, etc.),
  severity: 'info' | 'warning' | 'critical' (default: 'info'),
  ip: String,
  userAgent: String,
  meta: Mixed,
  createdAt: Date (TTL 180 days),
}
```

## ApiKey
```js
{
  name: String,
  key: String (hashed, prefix visible: 'agui_xxxxx...'),
  owner: ObjectId<User>,
  scopes: [String],
  lastUsed: Date,
  expiresAt: Date,
}
```

## Enums críticos

| Enum | Valores | Notas |
|---|---|---|
| `User.role` | `admin`, `member` | NO `user` |
| `Task.status` | `pendiente`, `en_curso`, `hecho` | NO `en_progreso` |
| `Post.status` | `borrador`, `publicado` | |
| `Appointment.status` | `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show` | NO `pending` |
| `Project.status` | `planning`, `in_progress`, `on_hold`, `completed`, `cancelled` | |
| `Task.priority` | `low`, `medium`, `high`, `urgent` | |
| `Appointment.location` | `Google Meet`, `Zoom`, `Presencial (CDMX)`, `Teléfono`, `Manual` | |
