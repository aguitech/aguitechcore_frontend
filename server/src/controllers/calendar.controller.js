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

// Build a filter for projects the user can see (owner or member)
function buildUserProjectFilter(userId) {
  return {
    $or: [
      { owner: userId },
      { 'members.user': userId },
    ],
  };
}

export async function getEvents(req, res, next) {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    // 1) Tareas visibles para el usuario con dueDate dentro del rango
    const taskFilter = await buildUserTaskFilter(req.user._id);
    if (Object.keys(dateFilter).length) taskFilter.dueDate = dateFilter;
    const tasks = await Task.find(taskFilter)
      .select('title dueDate status priority project')
      .populate('project', 'title')
      .lean();

    // 2) Proyectos visibles con endDate dentro del rango
    const projectFilter = buildUserProjectFilter(req.user._id);
    if (Object.keys(dateFilter).length) projectFilter.endDate = dateFilter;
    const projects = await Project.find(projectFilter)
      .select('title endDate status startDate')
      .lean();

    const events = [
      ...tasks.map((t) => ({
        id: `task-${t._id}`,
        type: 'task',
        title: t.title,
        date: t.dueDate,
        status: t.status,
        priority: t.priority,
        project: t.project ? t.project.title : null,
        color: t.status === 'hecho' ? '#22c55e' : t.priority === 'alta' ? '#ef4444' : '#FF6A00',
      })),
      ...projects
        .filter((p) => p.endDate)
        .map((p) => ({
          id: `project-${p._id}`,
          type: 'project',
          title: p.title,
          date: p.endDate,
          status: p.status,
          color: '#3b82f6',
        })),
    ];

    res.json(events);
  } catch (err) { next(err); }
}
