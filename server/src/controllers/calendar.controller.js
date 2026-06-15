import Task from '../models/Task.js';
import Project from '../models/Project.js';

export async function getEvents(req, res, next) {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const taskEvents = await Task.find({ owner: req.user._id, dueDate: dateFilter })
      .select('title dueDate status priority')
      .lean();
    const projectDeadlines = await Project.find({
      owner: req.user._id,
      // usar updatedAt + status como proxy de deadline si no hay campo dueDate
    })
      .select('title status createdAt')
      .lean();

    const events = [
      ...taskEvents.map((t) => ({
        id: `task-${t._id}`,
        type: 'task',
        title: t.title,
        date: t.dueDate,
        status: t.status,
        priority: t.priority,
        color: t.status === 'hecho' ? '#22c55e' : t.priority === 'alta' ? '#ef4444' : '#FF6A00',
      })),
    ];

    res.json(events);
  } catch (err) { next(err); }
}
