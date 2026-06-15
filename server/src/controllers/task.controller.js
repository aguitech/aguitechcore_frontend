import Task from '../models/Task.js';

export async function listTasks(req, res, next) {
  try {
    const filter = { owner: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    const tasks = await Task.find(filter)
      .populate('project', 'title')
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
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true, runValidators: true }
    ).populate(['project', 'client']);
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

export async function deleteTask(req, res, next) {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
