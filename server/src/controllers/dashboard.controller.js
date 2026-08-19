import Project from '../models/Project.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import { isSuperUser } from '../lib/superuser.js';
import Task from '../models/Task.js';

function buildProjectPayload(body) {
  const { title, clientId, status, progress, description, budget, startDate, endDate, members } = body;
  const payload = { title, status, progress, description };
  if (clientId) payload.client = clientId;
  if (budget !== undefined) payload.budget = budget === '' || budget === null ? null : Number(budget);
  if (startDate) payload.startDate = new Date(startDate);
  if (endDate) payload.endDate = new Date(endDate);
  if (endDate === '' || endDate === null) payload.endDate = null;
  if (startDate === '' || startDate === null) payload.startDate = null;
  if (members && Array.isArray(members)) payload.members = members;
  return payload;
}

export async function getStats(req, res, next) {
  try {
    // Stats de proyectos donde el user es owner o miembro
    const userFilter = {
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
      ],
    };
    const total = await Project.countDocuments(userFilter);
    const activos = await Project.countDocuments({ ...userFilter, status: 'activo' });
    const completados = await Project.countDocuments({ ...userFilter, status: 'completado' });
    const promedio = await Project.aggregate([
      { $match: userFilter },
      { $group: { _id: null, avg: { $avg: '$progress' } } },
    ]);
    res.json({
      total,
      activos,
      completados,
      promedio: promedio[0]?.avg ? Math.round(promedio[0].avg) : 0,
    });
  } catch (err) { next(err); }
}

export async function listProjects(req, res, next) {
  try {
    // Admins/staff see ALL projects; regular users only see their own + projects they're a member of.
    // Without the bypass, an admin who is NOT the owner/member of a project sees nothing → looks
    // like data was "lost" when in reality the filter hides everything from superusers.
    const filter = isSuperUser(req.user)
      ? {}
      : {
          $or: [
            { owner: req.user._id },
            { 'members.user': req.user._id },
          ],
        };
    const projects = await Project.find(filter)
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) { next(err); }
}

export async function getProject(req, res, next) {
  try {
    // Admins/staff can read any project; users only their own / member projects.
    const filter = isSuperUser(req.user)
      ? { _id: req.params.id }
      : {
          _id: req.params.id,
          $or: [
            { owner: req.user._id },
            { 'members.user': req.user._id },
          ],
        };
    const project = await Project.findOne(filter)
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role');
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    res.json(project);
  } catch (err) { next(err); }
}

export async function createProject(req, res, next) {
  try {
    const { title, clientId } = req.body;
    if (!title) return res.status(400).json({ message: 'Título requerido' });
    if (!clientId) return res.status(400).json({ message: 'Cliente requerido' });
    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ message: 'Cliente no existe' });
    const payload = buildProjectPayload(req.body);
    payload.client = clientId;
    const project = await Project.create({ ...payload, owner: req.user._id });
    const populated = await project.populate(['client', 'members.user']);
    res.status(201).json(populated);
  } catch (err) { next(err); }
}

export async function updateProject(req, res, next) {
  try {
    if (req.body.clientId) {
      const client = await Client.findById(req.body.clientId);
      if (!client) return res.status(400).json({ message: 'Cliente no existe' });
    }
    const payload = buildProjectPayload(req.body);
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      payload,
      { new: true, runValidators: true }
    )
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role');
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    res.json(project);
  } catch (err) { next(err); }
}

export async function deleteProject(req, res, next) {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Add a member to a project by email
export async function addMember(req, res, next) {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: `No existe un usuario con email ${email}` });
    if (!Project.MEMBER_ROLES.includes(role || 'colaborador')) {
      return res.status(400).json({ message: `Rol inválido. Opciones: ${Project.MEMBER_ROLES.join(', ')}` });
    }
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    // Avoid duplicates
    if (project.members.some(m => m.user.toString() === user._id.toString())) {
      return res.status(409).json({ message: 'Ese usuario ya es miembro del proyecto' });
    }
    project.members.push({ user: user._id, role: role || 'colaborador' });
    await project.save();
    const populated = await Project.findById(project._id)
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role');
    res.status(201).json(populated);
  } catch (err) { next(err); }
}

// Remove a member — only admins can do this
export async function removeMember(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Solo administradores pueden quitar miembros del proyecto' });
    }
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    project.members = project.members.filter(m => m.user.toString() !== req.params.userId);
    await project.save();
    const populated = await Project.findById(project._id)
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role');
    res.json(populated);
  } catch (err) { next(err); }
}

export async function getMemberRoles(_req, res) {
  res.json({
    roles: Project.MEMBER_ROLES,
    labels: Project.MEMBER_ROLE_LABELS,
  });
}

// Get full project detail with tasks, members, and weighted status
export async function getProjectDetail(req, res, next) {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
      ],
    })
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role')
      .populate('owner', 'name email role');
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });

    // Fetch all tasks for this project
    const tasks = await Task.find({ project: project._id })
      .populate('owner', 'name email')
      .populate('comments.author', 'name email')
      .sort({ dueDate: 1, createdAt: -1 });

    // Aggregate stats
    const total = tasks.length;
    const byStatus = { pendiente: 0, en_curso: 0, hecho: 0 };
    const byPriority = { baja: 0, media: 0, alta: 0 };
    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    }

    // Weighted completion score:
    //  hecho=100, en_curso=50, pendiente=0  ->  average across all tasks
    const WEIGHTS = { hecho: 100, en_curso: 50, pendiente: 0 };
    const weighted = total === 0
      ? 0
      : Math.round(tasks.reduce((s, t) => s + (WEIGHTS[t.status] || 0), 0) / total);

    // Date health
    const now = new Date();
    const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'hecho').length;
    const upcoming = tasks.filter(t => t.dueDate && new Date(t.dueDate) >= now && t.status !== 'hecho')
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Next deadline
    const nextDeadline = upcoming[0]
      ? { taskId: upcoming[0]._id, title: upcoming[0].title, dueDate: upcoming[0].dueDate }
      : null;

    // Member contribution (how many tasks each member owns)
    const memberStats = (project.members || []).map((m) => {
      const userId = m.user._id.toString();
      const owned = tasks.filter(t => t.owner && t.owner._id.toString() === userId).length;
      const completed = tasks.filter(t => t.owner && t.owner._id.toString() === userId && t.status === 'hecho').length;
      return {
        user: m.user,
        role: m.role,
        addedAt: m.addedAt,
        tasksOwned: owned,
        tasksCompleted: completed,
      };
    });

    // Recent activity (last 5 comments across all tasks of this project)
    const recentComments = [];
    for (const t of tasks) {
      for (const c of (t.comments || [])) {
        recentComments.push({
          _id: c._id,
          text: c.text,
          author: c.author,
          createdAt: c.createdAt,
          taskId: t._id,
          taskTitle: t.title,
        });
      }
    }
    recentComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      project,
      stats: {
        totalTasks: total,
        byStatus,
        byPriority,
        weightedProgress: weighted,         // 0-100, ponderado por status
        manualProgress: project.progress,   // 0-100, lo que puso el usuario al editar
        overdue,
        upcomingCount: upcoming.length,
        nextDeadline,
        membersCount: (project.members || []).length,
      },
      tasks,
      memberStats,
      recentComments: recentComments.slice(0, 5),
    });
  } catch (err) { next(err); }
}
