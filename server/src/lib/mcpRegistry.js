// MCP tool registry.
// Each tool has:
//   - name (used in JSON-RPC calls)
//   - description (shown to the LLM)
//   - inputSchema (JSON Schema for arguments)
//   - handler(user, params) → any JSON-serializable result
//
// Handlers MUST enforce all permission checks (project membership, etc.)
// using the same rules the HTTP routes use. They NEVER trust the caller.
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { validateAssignee } from './assigneeValidator.js';
import { buildProjectReportPdf } from './pdfReport.js';

// ===== Permission helpers =====
// Mirror the access rules used by HTTP routes. The user parameter is
// always req.user (or apiKey.user), populated by the auth middleware.

// Robust ObjectId extraction: handles both raw ObjectId AND populated
// documents (which have ._id). Without this, populated fields like
// project.owner stringify to "[object Object]" and permission checks
// silently fail with "[object Object]" === userId comparisons.
function idOf(field) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (field._id) return field._id.toString();
  return field.toString();
}

function canSeeProject(project, userId) {
  if (!project) return false;
  const target = userId.toString();
  if (idOf(project.owner) === target) return true;
  return (project.members || []).some((m) => idOf(m.user) === target);
}

function canEditProject(project, userId) {
  // Only the owner can edit project metadata; members can comment but not edit.
  return project && idOf(project.owner) === userId.toString();
}

async function loadProjectForUser(projectId, userId) {
  const project = await Project.findById(projectId)
    .populate('client', 'name company email status phone')
    .populate('members.user', 'name email role')
    .populate('owner', 'name email role');
  if (!project) return { error: { status: 404, message: 'Proyecto no encontrado' } };
  if (!canSeeProject(project, userId)) {
    return { error: { status: 403, message: 'No tienes acceso a este proyecto' } };
  }
  return { project };
}

// ===== Tool definitions =====

const tools = [
  // ===== PROJECTS =====
  {
    name: 'list_projects',
    description: 'Lista todos los proyectos donde el usuario autenticado es dueño o miembro. Retorna resumen con id, título, cliente, estado y progreso.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (user) => {
      const projects = await Project.find({
        $or: [{ owner: user._id }, { 'members.user': user._id }],
      })
        .populate('client', 'name company')
        .populate('owner', 'name email')
        .sort({ updatedAt: -1 });
      return projects.map((p) => ({
        id: p._id,
        title: p.title,
        client: p.client ? { id: p.client._id, name: p.client.name, company: p.client.company } : null,
        owner: p.owner ? { id: p.owner._id, name: p.owner.name } : null,
        status: p.status,
        progress: p.progress,
        memberCount: (p.members || []).length + 1,
        startDate: p.startDate,
        endDate: p.endDate,
      }));
    },
  },

  {
    name: 'get_project',
    description: 'Obtiene el detalle completo de un proyecto: metadata, descripción, miembros y estadísticas de tareas. Requiere ser dueño o miembro.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'ID del proyecto (24 hex chars)' } },
      required: ['project_id'],
      additionalProperties: false,
    },
    handler: async (user, { project_id }) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      const tasks = await Task.find({ project: project._id });
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === 'hecho').length;
      const inProgress = tasks.filter((t) => t.status === 'en_curso').length;
      const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'hecho').length;
      return {
        id: project._id,
        title: project.title,
        description: project.description,
        client: project.client,
        owner: project.owner,
        members: (project.members || []).map((m) => ({
          user: m.user, role: m.role, addedAt: m.addedAt,
        })),
        status: project.status,
        progress: project.progress,
        budget: project.budget,
        startDate: project.startDate,
        endDate: project.endDate,
        stats: { total, done, inProgress, overdue },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    },
  },

  {
    name: 'create_project',
    description: 'Crea un nuevo proyecto. Solo admin/manager pueden crear proyectos (otros roles: error 403). El usuario autenticado queda como dueño.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del proyecto' },
        client_id: { type: 'string', description: 'ID del cliente al que pertenece' },
        description: { type: 'string', description: 'Descripción opcional' },
        budget: { type: 'number', description: 'Presupuesto en MXN (opcional)' },
        start_date: { type: 'string', description: 'Fecha de inicio ISO (opcional)' },
        end_date: { type: 'string', description: 'Fecha de fin ISO (opcional)' },
      },
      required: ['title', 'client_id'],
      additionalProperties: false,
    },
    handler: async (user, { title, client_id, description, budget, start_date, end_date }) => {
      if (!['admin', 'manager'].includes(user.role)) {
        throw Object.assign(new Error('Solo admin o manager pueden crear proyectos'), { status: 403 });
      }
      const client = await Client.findById(client_id);
      if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
      const project = await Project.create({
        title: title.trim(),
        client: client._id,
        description: description || '',
        budget: budget ?? null,
        startDate: start_date ? new Date(start_date) : null,
        endDate: end_date ? new Date(end_date) : null,
        owner: user._id,
        members: [],
      });
      return { id: project._id, title: project.title, status: project.status };
    },
  },

  // ===== TASKS =====
  {
    name: 'list_my_tasks',
    description: 'Lista tareas asignadas al usuario autenticado (como responsable/assignee). Opcionalmente filtra por estado.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendiente', 'en_curso', 'hecho'], description: 'Filtrar por estado (opcional)' },
      },
      additionalProperties: false,
    },
    handler: async (user, { status } = {}) => {
      const filter = { assignee: user._id };
      if (status) filter.status = status;
      const tasks = await Task.find(filter)
        .populate('project', 'title')
        .populate('client', 'name')
        .sort({ dueDate: 1 });
      return tasks.map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        project: t.project ? { id: t.project._id, title: t.project.title } : null,
        client: t.client ? { id: t.client._id, name: t.client.name } : null,
      }));
    },
  },

  {
    name: 'get_task',
    description: 'Obtiene el detalle de una tarea: descripción, estado, prioridad, responsable, adjuntos y comentarios.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    handler: async (user, { task_id }) => {
      const task = await Task.findById(task_id)
        .populate('project', 'title owner members')
        .populate('client', 'name')
        .populate('owner', 'name email')
        .populate('assignee', 'name email')
        .populate('comments.author', 'name email');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const proj = task.project;
        const canSee = idOf(proj.owner) === user._id.toString()
          || (proj.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      } else if (task.owner && task.owner._id.toString() !== user._id.toString()) {
        throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      return {
        id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        project: task.project ? { id: task.project._id, title: task.project.title } : null,
        client: task.client ? { id: task.client._id, name: task.client.name } : null,
        owner: task.owner,
        assignee: task.assignee,
        comments: (task.comments || []).map((c) => ({
          id: c._id, text: c.text, author: c.author, createdAt: c.createdAt,
        })),
        links: (task.links || []).map((l) => ({
          id: l._id, url: l.url, title: l.title, description: l.description, addedBy: l.addedBy, createdAt: l.createdAt,
        })),
        attachmentCounts: {
          images: (task.images || []).length,
          videos: (task.videos || []).length,
          documents: (task.documents || []).length,
        },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    },
  },

  {
    name: 'create_task',
    description: 'Crea una nueva tarea en un proyecto. El responsable (assignee) debe ser miembro del proyecto o su dueño. Si no se especifica, queda asignada al usuario que crea.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID del proyecto' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['baja', 'media', 'alta'], description: 'Default: media' },
        due_date: { type: 'string', description: 'ISO date string' },
        assignee_email: { type: 'string', description: 'Email del responsable (debe ser miembro del proyecto)' },
      },
      required: ['project_id', 'title'],
      additionalProperties: false,
    },
    handler: async (user, { project_id, title, description, priority, due_date, assignee_email }) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      let assigneeId = null;
      if (assignee_email) {
        const a = await User.findOne({ email: assignee_email.toLowerCase().trim() });
        if (!a) throw Object.assign(new Error(`No existe usuario con email ${assignee_email}`), { status: 400 });
        assigneeId = a._id;
        await validateAssignee(project_id, assigneeId);
      }
      const task = await Task.create({
        title: title.trim(),
        description: description || '',
        priority: priority || 'media',
        dueDate: due_date ? new Date(due_date) : null,
        project: project._id,
        client: project.client?._id || null,
        owner: user._id,
        assignee: assigneeId,
      });
      return { id: task._id, title: task.title, status: task.status, priority: task.priority };
    },
  },

  {
    name: 'update_task_status',
    description: 'Cambia el estado de una tarea (pendiente / en_curso / hecho). Requiere ser dueño o miembro del proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['pendiente', 'en_curso', 'hecho'] },
      },
      required: ['task_id', 'status'],
      additionalProperties: false,
    },
    handler: async (user, { task_id, status }) => {
      const task = await Task.findById(task_id).populate('project', 'owner members');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const canSee = idOf(task.project.owner) === user._id.toString()
          || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      task.status = status;
      await task.save();
      return { id: task._id, title: task.title, status: task.status };
    },
  },

  {
    name: 'assign_task',
    description: 'Asigna una tarea a un miembro del proyecto. El assignee debe ser miembro del proyecto o su dueño.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        assignee_email: { type: 'string', description: 'Email del nuevo responsable. null para desasignar.' },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
    handler: async (user, { task_id, assignee_email }) => {
      const task = await Task.findById(task_id).populate('project', 'owner members');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (!task.project) throw Object.assign(new Error('Esta tarea no pertenece a un proyecto'), { status: 400 });
      const canSee = idOf(task.project.owner) === user._id.toString()
        || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
      if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      let assigneeId = null;
      if (assignee_email) {
        const a = await User.findOne({ email: assignee_email.toLowerCase().trim() });
        if (!a) throw Object.assign(new Error(`No existe usuario con email ${assignee_email}`), { status: 400 });
        await validateAssignee(task.project._id, a._id);
        assigneeId = a._id;
      }
      task.assignee = assigneeId;
      await task.save();
      return { id: task._id, title: task.title, assignee: assigneeId };
    },
  },

  {
    name: 'add_comment',
    description: 'Agrega un comentario a una tarea. Requiere acceso al proyecto (dueño o miembro).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        text: { type: 'string', maxLength: 2000 },
      },
      required: ['task_id', 'text'],
      additionalProperties: false,
    },
    handler: async (user, { task_id, text }) => {
      const task = await Task.findById(task_id).populate('project', 'owner members');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const canSee = idOf(task.project.owner) === user._id.toString()
          || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      task.comments.push({ text: text.trim(), author: user._id });
      await task.save();
      const last = task.comments[task.comments.length - 1];
      return { id: last._id, text: last.text, createdAt: last.createdAt };
    },
  },

  // ===== TASK LINKS (external URLs) =====
  {
    name: 'add_task_link',
    description: 'Agrega un enlace externo (URL) a una tarea. Acepta URLs http/https únicamente. Requiere acceso al proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID de la tarea' },
        url: { type: 'string', description: 'URL completa (debe empezar con http:// o https://)' },
        title: { type: 'string', description: 'Título corto del enlace (opcional, max 200 chars)' },
        description: { type: 'string', description: 'Descripción opcional (max 500 chars)' },
      },
      required: ['task_id', 'url'],
      additionalProperties: false,
    },
    handler: async (user, { task_id, url, title, description }) => {
      // Validate URL
      const trimmed = (url || '').trim();
      if (!trimmed) throw Object.assign(new Error('URL vacía'), { status: 400 });
      if (trimmed.length > 2000) throw Object.assign(new Error('URL demasiado larga'), { status: 400 });
      let parsed;
      try { parsed = new URL(trimmed); } catch (_) {
        throw Object.assign(new Error('URL malformada'), { status: 400 });
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw Object.assign(new Error('Solo se permiten URLs http(s)'), { status: 400 });
      }

      const task = await Task.findById(task_id).populate('project', 'owner members');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const canSee = idOf(task.project.owner) === user._id.toString()
          || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      task.links.push({
        url: trimmed,
        title: (title || '').trim().slice(0, 200),
        description: (description || '').trim().slice(0, 500),
        addedBy: user._id,
      });
      await task.save();
      const last = task.links[task.links.length - 1];
      return { id: last._id, url: last.url, title: last.title, createdAt: last.createdAt };
    },
  },

  {
    name: 'list_task_links',
    description: 'Lista los enlaces externos de una tarea. Requiere acceso al proyecto.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    handler: async (user, { task_id }) => {
      const task = await Task.findById(task_id)
        .populate('project', 'owner members')
        .populate('links.addedBy', 'name email');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const canSee = idOf(task.project.owner) === user._id.toString()
          || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      return (task.links || []).map((l) => ({
        id: l._id,
        url: l.url,
        title: l.title,
        description: l.description,
        addedBy: l.addedBy,
        createdAt: l.createdAt,
      }));
    },
  },

  {
    name: 'delete_task_link',
    description: 'Elimina un enlace de una tarea. Requiere acceso al proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        link_id: { type: 'string', description: 'ID del enlace a eliminar' },
      },
      required: ['task_id', 'link_id'],
      additionalProperties: false,
    },
    handler: async (user, { task_id, link_id }) => {
      const task = await Task.findById(task_id).populate('project', 'owner members');
      if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
      if (task.project) {
        const canSee = idOf(task.project.owner) === user._id.toString()
          || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
        if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
      }
      const before = (task.links || []).length;
      task.links = (task.links || []).filter((l) => l._id.toString() !== link_id);
      if (task.links.length === before) {
        throw Object.assign(new Error('Enlace no encontrado'), { status: 404 });
      }
      await task.save();
      return { ok: true, removed: before - task.links.length };
    },
  },

  // ===== CLIENTS =====
  {
    name: 'list_clients',
    description: 'Lista clientes. Admin/manager ven todos; otros roles solo ven los clientes donde son miembros.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (user) => {
      let query = {};
      if (!['admin', 'manager'].includes(user.role)) {
        // Clients see only clients that own projects where the user is a member
        const userProjects = await Project.find({
          $or: [{ owner: user._id }, { 'members.user': user._id }],
        }).select('client');
        const clientIds = [...new Set(userProjects.map((p) => p.client.toString()))];
        query = { _id: { $in: clientIds } };
      }
      const clients = await Client.find(query).sort({ name: 1 });
      return clients.map((c) => ({
        id: c._id,
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        status: c.status,
      }));
    },
  },

  {
    name: 'get_client',
    description: 'Obtiene un cliente con sus proyectos asociados.',
    inputSchema: {
      type: 'object',
      properties: { client_id: { type: 'string' } },
      required: ['client_id'],
      additionalProperties: false,
    },
    handler: async (user, { client_id }) => {
      const client = await Client.findById(client_id);
      if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
      const projects = await Project.find({
        client: client._id,
        $or: [{ owner: user._id }, { 'members.user': user._id }],
      }).select('title status progress');
      return {
        id: client._id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        notes: client.notes,
        status: client.status,
        projects: projects.map((p) => ({
          id: p._id, title: p.title, status: p.status, progress: p.progress,
        })),
      };
    },
  },

  {
    name: 'create_client',
    description: 'Crea un nuevo cliente. Solo admin/manager.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name', 'email'],
      additionalProperties: false,
    },
    handler: async (user, { name, company, email, phone, notes }) => {
      if (!['admin', 'manager'].includes(user.role)) {
        throw Object.assign(new Error('Solo admin o manager pueden crear clientes'), { status: 403 });
      }
      const c = await Client.create({
        name: name.trim(),
        company: company || '',
        email: email.toLowerCase().trim(),
        phone: phone || '',
        notes: notes || '',
        owner: user._id,
      });
      return { id: c._id, name: c.name, email: c.email };
    },
  },

  // ===== MEMBERS =====
  {
    name: 'list_project_members',
    description: 'Lista los miembros de un proyecto (incluyendo al dueño).',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
      additionalProperties: false,
    },
    handler: async (user, { project_id }) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      const out = [{
        user: project.owner, role: 'dueño', addedAt: project.createdAt,
      }];
      for (const m of (project.members || [])) {
        out.push({ user: m.user, role: m.role, addedAt: m.addedAt });
      }
      return out;
    },
  },

  {
    name: 'add_project_member',
    description: 'Agrega un usuario como miembro de un proyecto. Solo el dueño del proyecto puede hacerlo.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        user_email: { type: 'string' },
        role: { type: 'string', enum: ['colaborador', 'revisor', 'observador'] },
      },
      required: ['project_id', 'user_email'],
      additionalProperties: false,
    },
    handler: async (user, { project_id, user_email, role }) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      if (!canEditProject(project, user._id)) {
        throw Object.assign(new Error('Solo el dueño del proyecto puede agregar miembros'), { status: 403 });
      }
      const target = await User.findOne({ email: user_email.toLowerCase().trim() });
      if (!target) throw Object.assign(new Error(`No existe usuario con email ${user_email}`), { status: 400 });
      const exists = (project.members || []).some((m) => idOf(m.user) === target._id.toString());
      if (exists) throw Object.assign(new Error('El usuario ya es miembro'), { status: 400 });
      project.members.push({ user: target._id, role: role || 'colaborador' });
      await project.save();
      return { ok: true, addedUser: { id: target._id, email: target.email, name: target.name } };
    },
  },

  {
    name: 'remove_project_member',
    description: 'Quita un usuario de un proyecto. Solo el dueño del proyecto puede hacerlo.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        user_email: { type: 'string' },
      },
      required: ['project_id', 'user_email'],
      additionalProperties: false,
    },
    handler: async (user, { project_id, user_email }) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      if (!canEditProject(project, user._id)) {
        throw Object.assign(new Error('Solo el dueño del proyecto puede quitar miembros'), { status: 403 });
      }
      const target = await User.findOne({ email: user_email.toLowerCase().trim() });
      if (!target) throw Object.assign(new Error(`No existe usuario con email ${user_email}`), { status: 400 });
      project.members = (project.members || []).filter((m) => idOf(m.user) !== target._id.toString());
      await project.save();
      return { ok: true };
    },
  },

  // ===== CHAT =====
  {
    name: 'list_chat_conversations',
    description: 'Lista las conversaciones de chat del usuario (1-on-1 con miembros del equipo).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (user) => {
      const convs = await Conversation.find({ 'participants.user': user._id })
        .populate('participants.user', 'name email role')
        .populate({ path: 'lastMessage', select: 'text sender createdAt' })
        .sort({ lastMessageAt: -1 });
      return convs.map((c) => {
        const other = c.participants.find((p) => {
          const id = p.user._id || p.user;
          return id.toString() !== user._id.toString();
        });
        return {
          id: c._id,
          other: other ? { id: other.user._id, name: other.user.name, email: other.user.email } : null,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt,
        };
      });
    },
  },

  {
    name: 'list_chat_messages',
    description: 'Lista los últimos N mensajes de una conversación (de más nuevo a más viejo).',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 30' },
      },
      required: ['conversation_id'],
      additionalProperties: false,
    },
    handler: async (user, { conversation_id, limit }) => {
      const conv = await Conversation.findOne({
        _id: conversation_id,
        'participants.user': user._id,
      });
      if (!conv) throw Object.assign(new Error('Conversación no encontrada'), { status: 404 });
      const msgs = await Message.find({ conversation: conv._id })
        .populate('sender', 'name email')
        .sort({ _id: -1 })
        .limit(limit || 30);
      return msgs.reverse().map((m) => ({
        id: m._id,
        text: m.text,
        sender: m.sender,
        attachments: (m.attachments || []).map((a) => ({
          kind: a.kind, url: a.url, filename: a.filename, mimetype: a.mimetype, size: a.size,
        })),
        createdAt: m.createdAt,
      }));
    },
  },

  {
    name: 'send_chat_message',
    description: 'Envía un mensaje en una conversación de la que el usuario es participante. Para adjuntar archivos (fotos/videos/documentos) usa el endpoint REST POST /api/chat/conversations/:id/messages con multipart/form-data (campo "files").',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
        text: { type: 'string', maxLength: 4000 },
      },
      required: ['conversation_id', 'text'],
      additionalProperties: false,
    },
    handler: async (user, { conversation_id, text }) => {
      const conv = await Conversation.findOne({
        _id: conversation_id,
        'participants.user': user._id,
      });
      if (!conv) throw Object.assign(new Error('Conversación no encontrada'), { status: 404 });
      const msg = await Message.create({
        conversation: conv._id,
        sender: user._id,
        text: text.trim(),
        readBy: [user._id],
      });
      conv.lastMessage = msg._id;
      conv.lastMessageAt = msg.createdAt;
      await conv.save();
      return { id: msg._id, text: msg.text, createdAt: msg.createdAt };
    },
  },

  // ===== REPORTS =====
  {
    name: 'generate_project_report',
    description: 'Genera el reporte PDF de un proyecto. Retorna el PDF en base64 junto con metadata. Requiere ser dueño o miembro del proyecto.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
      additionalProperties: false,
    },
    handler: async (user, { project_id }, context = {}) => {
      const { project, error } = await loadProjectForUser(project_id, user._id);
      if (error) throw Object.assign(new Error(error.message), { status: error.status });
      const buf = await buildProjectReportPdf(project_id, user, context.publicBaseUrl);
      if (!buf) throw Object.assign(new Error('No se pudo generar el reporte'), { status: 500 });
      return {
        filename: `proyecto_${project.title.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_')}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: buf.length,
        base64: buf.toString('base64'),
      };
    },
  },

  // ===== USER =====
  {
    name: 'whoami',
    description: 'Retorna la identidad del usuario que está haciendo la llamada MCP (útil para depurar).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }),
  },
];

// ===== Registry lookups =====

const toolMap = new Map(tools.map((t) => [t.name, t]));

export function listTools() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function callTool(name, params, user, context = {}) {
  const t = toolMap.get(name);
  if (!t) throw Object.assign(new Error(`Tool no encontrada: ${name}`), { status: 404 });
  // Validate params against schema minimally (mongo-sanitize is overkill here;
  // we trust our own handlers + JWT/API key auth)
  if (t.inputSchema && t.inputSchema.required) {
    for (const req of t.inputSchema.required) {
      if (params == null || params[req] === undefined) {
        throw Object.assign(new Error(`Parámetro requerido: ${req}`), { status: 400 });
      }
    }
  }
  return t.handler(user, params || {}, context);
}

// ===== Resources =====
// Read-only data endpoints identified by URI.
export function listResources() {
  return [
    {
      uri: 'project://{project_id}',
      name: 'Proyecto',
      description: 'JSON con metadata del proyecto + miembros + estadísticas de tareas. Reemplaza {project_id} por el id real.',
      mimeType: 'application/json',
    },
    {
      uri: 'task://{task_id}',
      name: 'Tarea',
      description: 'JSON con la tarea completa + comentarios.',
      mimeType: 'application/json',
    },
    {
      uri: 'client://{client_id}',
      name: 'Cliente',
      description: 'JSON con cliente + sus proyectos accesibles.',
      mimeType: 'application/json',
    },
  ];
}

export async function readResource(uri, user) {
  // URI parsing: scheme://identifier
  const m = /^([a-z]+):\/\/(.+)$/i.exec(uri);
  if (!m) throw Object.assign(new Error(`URI inválido: ${uri}`), { status: 400 });
  const [, scheme, id] = m;

  if (scheme === 'project') {
    const { project, error } = await loadProjectForUser(id, user._id);
    if (error) throw Object.assign(new Error(error.message), { status: error.status });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          id: project._id, title: project.title, description: project.description,
          status: project.status, progress: project.progress,
          client: project.client, owner: project.owner,
          members: project.members, startDate: project.startDate, endDate: project.endDate,
        }, null, 2),
      }],
    };
  }
  if (scheme === 'task') {
    const task = await Task.findById(id).populate('project', 'title owner members');
    if (!task) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
    if (task.project) {
      const canSee = idOf(task.project.owner) === user._id.toString()
        || (task.project.members || []).some((m) => idOf(m.user) === user._id.toString());
      if (!canSee) throw Object.assign(new Error('No tienes acceso a esta tarea'), { status: 403 });
    }
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify(task, null, 2),
      }],
    };
  }
  if (scheme === 'client') {
    const client = await Client.findById(id);
    if (!client) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
    const projects = await Project.find({
      client: client._id,
      $or: [{ owner: user._id }, { 'members.user': user._id }],
    }).select('title status progress');
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify({ ...client.toObject(), projects }, null, 2),
      }],
    };
  }
  throw Object.assign(new Error(`Scheme no soportado: ${scheme}`), { status: 400 });
}
