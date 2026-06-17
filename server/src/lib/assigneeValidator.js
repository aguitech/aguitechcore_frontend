// Helper: validate that an assignee belongs to the project (or is the project owner).
// Only applies when the task belongs to a project. If the task has no project,
// assignee can be any user (owner defaults to the task's owner).
import Project from '../models/Project.js';
import mongoose from 'mongoose';

export async function validateAssignee(projectId, assigneeId) {
  // No project + no assignee is fine (task inherits owner)
  if (!assigneeId) return null;
  if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
    throw Object.assign(new Error('ID de responsable inválido'), { status: 400 });
  }
  // If task has no project but has an assignee, accept it (allow self-assignment)
  if (!projectId) return assigneeId;

  const project = await Project.findById(projectId).select('owner members');
  if (!project) {
    throw Object.assign(new Error('Proyecto no encontrado'), { status: 404 });
  }
  const isOwner = project.owner.toString() === assigneeId;
  const isMember = (project.members || []).some((m) => m.user.toString() === assigneeId);
  if (!isOwner && !isMember) {
    throw Object.assign(
      new Error('El responsable debe ser miembro del proyecto o el dueño del proyecto'),
      { status: 400 }
    );
  }
  return assigneeId;
}
