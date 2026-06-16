import Project from '../models/Project.js';
import Client from '../models/Client.js';
import User from '../models/User.js';

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

export async function getStats(_req, res, next) {
  try {
    const total = await Project.countDocuments();
    const activos = await Project.countDocuments({ status: 'activo' });
    const completados = await Project.countDocuments({ status: 'completado' });
    const promedio = await Project.aggregate([{ $group: { _id: null, avg: { $avg: '$progress' } } }]);
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
    const projects = await Project.find({ owner: req.user._id })
      .populate('client', 'name company email status')
      .populate('members.user', 'name email role')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) { next(err); }
}

export async function getProject(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id })
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

// Remove a member
export async function removeMember(req, res, next) {
  try {
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
