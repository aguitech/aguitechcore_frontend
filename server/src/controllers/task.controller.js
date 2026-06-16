import Task from '../models/Task.js';
import Project from '../models/Project.js';

// Build a filter that shows tasks from projects where user is owner OR member,
// OR tasks the user owns directly
async function buildUserTaskFilter(userId) {
  const accessibleProjectIds = await Project.find({
    $or: [
      { owner: userId },
      { 'members.user': userId },
    ],
  }).distinct('_id');
  return {
    $or: [
      { owner: userId },
      { project: { $in: accessibleProjectIds } },
    ],
  };
}

export async function listTasks(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    if (req.query.status) filter.status = req.query.status;
    const tasks = await Task.find(filter)
      .populate('project', 'title status')
      .populate('client', 'name')
      .sort({ dueDate: 1, createdAt: -1 });
    res.json(tasks);
  } catch (err) { next(err); }
}

export async function createTask(req, res, next) {
  try {
    const task = await Task.create({ ...req.body, owner: req.user._id });
    const populated = await task.populate(['project', 'client']);
    res.status(201).json(populated);
  } catch (err) { next(err); }
}

export async function updateTask(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const task = await Task.findOneAndUpdate(filter, req.body, { new: true, runValidators: true })
      .populate('project', 'title status')
      .populate('client', 'name');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

export async function deleteTask(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const task = await Task.findOneAndDelete(filter);
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
