import Incident from '../models/Incident.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { validateFile, categorizeFile } from '../lib/fileGuard.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

// ─────────────────────────────────────────────────────────────────
// INCIDENT CONTROLLER — mirror of task.controller.js with the
// specific semantics of an incident:
//   - SLA-aware (response/resolve deadlines)
//   - 4-stage status flow (abierta → en_atencion → resuelta → cerrada)
//   - Severity, type, impact, root cause, prevention fields
//   - References to affected tasks/projects/clients
// ─────────────────────────────────────────────────────────────────

// Reusable: file → object that lives inside the incident document.
function fileToObject(f, kind, uploadedBy) {
  // multer with diskStorage gives us f.path; the routes for documents
  // drain memory buffers to disk first, so f.path is always set.
  const url = `/uploads/${path.basename(f.path)}`;
  const cat = categorizeFile({ filename: f.originalname, mimetype: f.mimetype });
  return {
    url,
    filename: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    kind, // 'image' | 'video' | 'document'
    category: cat.category,
    uploadedBy,
  };
}

// ─────────────────────────────────────────────────────────────────
// LIST
//   Query params: status, severity, type, project, client, assignee,
//                 mine (only my incidents), search (title regex)
// ─────────────────────────────────────────────────────────────────
export async function listIncidents(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.project) filter.project = req.query.project;
    if (req.query.client) filter.client = req.query.client;
    if (req.query.assignee) filter.assignee = req.query.assignee;
    if (req.query.mine === 'true') {
      filter.$or = [{ owner: req.user._id }, { assignee: req.user._id }];
    }
    if (req.query.search) {
      const s = req.query.search.trim();
      if (s) {
        const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = filter.$or
          ? [...filter.$or, { title: rx }, { description: rx }]
          : [{ title: rx }, { description: rx }];
      }
    }

    const incidents = await Incident.find(filter)
      .populate('project', 'title status')
      .populate('client', 'name')
      .populate('owner', 'name email')
      .populate('assignee', 'name email')
      .populate('affectedTasks', 'title status')
      .populate('comments.author', 'name email')
      .populate('images.uploadedBy', 'name email')
      .populate('videos.uploadedBy', 'name email')
      .populate('documents.uploadedBy', 'name email')
      .populate('links.addedBy', 'name email')
      .sort({ severity: 1, createdAt: -1 }); // S1 first

    // Compute SLA status for each — frontend can use these without re-deriving.
    const data = incidents.map((inc) => {
      const obj = inc.toObject();
      obj.sla = {
        status: inc.slaStatus(),
        responseDueAt: inc.responseDueAt,
        resolveDueAt: inc.resolveDueAt,
        firstRespondedAt: inc.firstRespondedAt,
        resolvedAt: inc.resolvedAt,
        closedAt: inc.closedAt,
        ageMinutes: inc.ageMinutes(),
        minutesToBreach: inc.minutesToBreach(),
        breached: inc.slaStatus() === 'breached',
      };
      return obj;
    });

    res.json(data);
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// CREATE
//   Body: title, description, severity, type, project?, client?,
//         assignee?, impact?, affectedTasks?, links?.
//   SLA deadlines are computed in the model pre-save hook.
// ─────────────────────────────────────────────────────────────────
export async function createIncident(req, res, next) {
  try {
    const payload = { ...req.body };
    // Sanitize affectedTasks (must be array of valid ObjectIds)
    if (payload.affectedTasks && Array.isArray(payload.affectedTasks)) {
      payload.affectedTasks = payload.affectedTasks.filter((id) => mongoose.isValidObjectId(id));
    }
    const incident = await Incident.create({
      ...payload,
      owner: req.user._id,
    });

    const populated = await Incident.findById(incident._id)
      .populate('project', 'title status')
      .populate('client', 'name')
      .populate('owner', 'name email')
      .populate('assignee', 'name email')
      .populate('affectedTasks', 'title status');

    audit({
      req,
      action: 'incident.create',
      category: 'incident',
      targetType: 'Incident',
      targetId: incident._id,
      targetLabel: incident.title,
      severity: incident.severity === 'S1' ? 'critical' : incident.severity === 'S2' ? 'warning' : 'info',
      meta: { severity: incident.severity, type: incident.type, project: incident.project?._id || null },
    });

    // Notify the assignee (if different from creator).
    if (incident.assignee && String(incident.assignee) !== String(req.user._id)) {
      notify({
        recipient: incident.assignee,
        type: 'incident.assigned',
        title: `🚨 Te asignaron: ${incident.title}`,
        body: `${incident.severity} · ${incident.type} · ${incident.description?.slice(0, 150) || 'Sin descripción'}`,
        link: '/incidents',
        sourceType: 'Incident',
        sourceId: String(incident._id),
        actor: req.user._id,
        actorName: req.user.name,
      });
    }
    // Also notify the project owner if there's a project and it's different.
    if (incident.project && populated.project?.owner && String(populated.project.owner) !== String(req.user._id)) {
      // (Project.owner isn't populated — skip to avoid extra query. The
      // assignee notification covers the immediate triage path.)
    }

    res.status(201).json(populated);
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// UPDATE
//   Any field. Status changes trigger SLA timestamp updates via the
//   model pre-save hook. Resolved/closed incidents require resolution
//   text — surface a 400 if missing so the post-mortem isn't empty.
// ─────────────────────────────────────────────────────────────────
export async function updateIncident(req, res, next) {
  try {
    const existing = await Incident.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Incidencia no encontrada' });

    // Gate: if moving to 'resuelta' or 'cerrada', require resolution text.
    const newStatus = req.body.status;
    if ((newStatus === 'resuelta' || newStatus === 'cerrada') && !req.body.resolution) {
      const hasResolution = existing.resolution && existing.resolution.trim().length > 0;
      if (!hasResolution) {
        return res.status(400).json({
          message: 'Para resolver o cerrar una incidencia, debes describir la resolución.',
        });
      }
    }

    const beforeStatus = existing.status;
    const beforeAssignee = existing.assignee ? String(existing.assignee) : null;

    // Apply the update — pre-save hook handles status timestamps.
    Object.assign(existing, req.body);
    if (req.body.affectedTasks && Array.isArray(req.body.affectedTasks)) {
      existing.affectedTasks = req.body.affectedTasks.filter((id) => mongoose.isValidObjectId(id));
    }
    await existing.save();

    const populated = await Incident.findById(existing._id)
      .populate('project', 'title status')
      .populate('client', 'name')
      .populate('owner', 'name email')
      .populate('assignee', 'name email')
      .populate('affectedTasks', 'title status')
      .populate('comments.author', 'name email');

    // Audit + notify on status/assignee changes
    if (beforeStatus !== populated.status) {
      audit({
        req,
        action: 'incident.status_change',
        category: 'incident',
        targetType: 'Incident',
        targetId: populated._id,
        targetLabel: populated.title,
        severity: populated.severity === 'S1' ? 'critical' : 'info',
        meta: { from: beforeStatus, to: populated.status },
      });
      // Notify owner when status changes (so they see it move)
      if (String(populated.owner._id) !== String(req.user._id)) {
        notify({
          recipient: populated.owner._id,
          type: 'incident.status_changed',
          title: `🔄 ${populated.title}: ${beforeStatus} → ${populated.status}`,
          body: `Actualizado por ${req.user.name}`,
          link: '/incidents',
          sourceType: 'Incident',
          sourceId: String(populated._id),
          actor: req.user._id,
          actorName: req.user.name,
        });
      }
    }

    const newAssigneeId = populated.assignee ? String(populated.assignee._id) : null;
    if (beforeAssignee !== newAssigneeId) {
      audit({
        req,
        action: 'incident.assign',
        category: 'incident',
        targetType: 'Incident',
        targetId: populated._id,
        targetLabel: populated.title,
        meta: { from: beforeAssignee, to: newAssigneeId },
      });
      if (newAssigneeId && newAssigneeId !== String(req.user._id)) {
        notify({
          recipient: newAssigneeId,
          type: 'incident.assigned',
          title: `🔁 Te reasignaron: ${populated.title}`,
          body: `${populated.severity} · ${populated.type}`,
          link: '/incidents',
          sourceType: 'Incident',
          sourceId: String(populated._id),
          actor: req.user._id,
          actorName: req.user.name,
        });
      }
    }

    res.json(populated);
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────
export async function deleteIncident(req, res, next) {
  try {
    const incident = await Incident.findByIdAndDelete(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    audit({
      req,
      action: 'incident.delete',
      category: 'incident',
      targetType: 'Incident',
      targetId: incident._id,
      targetLabel: incident.title,
      severity: 'warning',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// ATTACHMENTS — same pattern as task.controller.js
// Each kind (image/video/document) writes to disk and appends to
// the incident's matching array.
// ─────────────────────────────────────────────────────────────────
async function addFiles(req, res, next, kind) {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No se enviaron archivos' });
    }

    const newFiles = req.files
      .map((f) => {
        const obj = fileToObject(f, kind, req.user._id);
        // Defensive: validateFile throws if content is bogus
        try {
          validateFile({ ...f, kind });
          return obj;
        } catch (e) {
          // Best-effort: drop the bad file
          try { fs.unlinkSync(f.path); } catch {}
          return null;
        }
      })
      .filter(Boolean);

    const targetArr = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'documents';
    incident[targetArr].push(...newFiles);
    await incident.save();

    audit({
      req,
      action: `incident.${kind}.add`,
      category: 'incident',
      targetType: 'Incident',
      targetId: incident._id,
      targetLabel: incident.title,
      meta: { count: newFiles.length, kind },
    });

    res.status(201).json(incident[targetArr].slice(-newFiles.length));
  } catch (err) { next(err); }
}

export async function addImages(req, res, next) { return addFiles(req, res, next, 'image'); }
export async function addVideos(req, res, next) { return addFiles(req, res, next, 'video'); }
export async function addDocuments(req, res, next) { return addFiles(req, res, next, 'document'); }

// Delete a specific file from an incident.
export async function deleteFile(req, res, next) {
  try {
    const { id, kind, fileId } = req.params;
    const incident = await Incident.findById(id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    const arrName = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'documents';
    const arr = incident[arrName] || [];
    const idx = arr.findIndex((f) => String(f._id) === String(fileId));
    if (idx < 0) return res.status(404).json({ message: 'Archivo no encontrado' });
    const [removed] = arr.splice(idx, 1);
    incident[arrName] = arr;
    await incident.save();
    // Best-effort delete from disk
    if (removed?.url?.startsWith('/uploads/')) {
      try { fs.unlinkSync(path.resolve('uploads', path.basename(removed.url))); } catch {}
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// LINKS
// ─────────────────────────────────────────────────────────────────
export async function addLink(req, res, next) {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    const { url, title, description } = req.body;
    if (!url) return res.status(400).json({ message: 'URL es requerida' });
    incident.links.push({ url, title, description, addedBy: req.user._id });
    await incident.save();
    res.status(201).json(incident.links[incident.links.length - 1]);
  } catch (err) { next(err); }
}

export async function deleteLink(req, res, next) {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    const { linkId } = req.params;
    const before = incident.links.length;
    incident.links = incident.links.filter((l) => String(l._id) !== String(linkId));
    if (incident.links.length === before) return res.status(404).json({ message: 'Link no encontrado' });
    await incident.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────
export async function addComment(req, res, next) {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Texto es requerido' });
    incident.comments.push({ text: text.trim(), author: req.user._id });
    await incident.save();

    const populated = await Incident.findById(incident._id)
      .populate('comments.author', 'name email')
      .select('comments');

    const justAdded = populated.comments[populated.comments.length - 1];

    // Notify owner + assignee (if different from author)
    const recipients = new Set();
    if (incident.owner && String(incident.owner) !== String(req.user._id)) recipients.add(String(incident.owner));
    if (incident.assignee && String(incident.assignee) !== String(req.user._id)) recipients.add(String(incident.assignee));
    for (const rid of recipients) {
      notify({
        recipient: rid,
        type: 'incident.commented',
        title: `💬 Nuevo comentario en: ${incident.title}`,
        body: `${req.user.name}: ${text.slice(0, 150)}`,
        link: '/incidents',
        sourceType: 'Incident',
        sourceId: String(incident._id),
        actor: req.user._id,
        actorName: req.user.name,
      });
    }
    res.status(201).json(justAdded);
  } catch (err) { next(err); }
}

export async function deleteComment(req, res, next) {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incidencia no encontrada' });
    const { commentId } = req.params;
    const before = incident.comments.length;
    incident.comments = incident.comments.filter((c) => String(c._id) !== String(commentId));
    if (incident.comments.length === before) return res.status(404).json({ message: 'Comentario no encontrado' });
    await incident.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────────
// STATS — counts by status/severity/type for dashboard widgets.
// ─────────────────────────────────────────────────────────────────
export async function incidentStats(req, res, next) {
  try {
    const filter = {};
    if (req.query.mine === 'true') {
      filter.$or = [{ owner: req.user._id }, { assignee: req.user._id }];
    }
    const all = await Incident.find(filter).select('status severity type');
    const byStatus = all.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
    const bySeverity = all.reduce((acc, i) => { acc[i.severity] = (acc[i.severity] || 0) + 1; return acc; }, {});
    const byType = all.reduce((acc, i) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc; }, {});
    const slaBreached = all.filter((i) => i.slaStatus() === 'breached').length;
    res.json({ total: all.length, byStatus, bySeverity, byType, slaBreached });
  } catch (err) { next(err); }
}