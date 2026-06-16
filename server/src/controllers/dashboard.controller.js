import Project from '../models/Project.js';

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
    const projects = await Project.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) { next(err); }
}

export async function getProject(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });
    res.json(project);
  } catch (err) { next(err); }
}

export async function createProject(req, res, next) {
  try {
    const { title, client, status, progress, description, budget, startDate, endDate } = req.body;
    if (!title || !client) return res.status(400).json({ message: 'Título y cliente son requeridos' });
    const project = await Project.create({
      title, client, status, progress, description, budget, startDate, endDate,
      owner: req.user._id,
    });
    res.status(201).json(project);
  } catch (err) { next(err); }
}

export async function updateProject(req, res, next) {
  try {
    const { title, client, status, progress, description, budget, startDate, endDate } = req.body;
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { title, client, status, progress, description, budget, startDate, endDate },
      { new: true, runValidators: true }
    );
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
