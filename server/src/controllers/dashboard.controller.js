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

export async function createProject(req, res, next) {
  try {
    const project = await Project.create({ ...req.body, owner: req.user._id });
    res.status(201).json(project);
  } catch (err) { next(err); }
}
