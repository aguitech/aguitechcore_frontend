// Project PDF report generator — shared by HTTP route and MCP.
// Builds a PDFKit document for a given project (loaded with all the
// relationships the report needs) and pipes it into the provided
// writable stream. Caller decides what to do with the bytes
// (HTTP response, disk file, base64 buffer, etc.).
//
// The data loading lives here too so both call paths use identical queries
// and permission rules (project must be owned by user OR have user as member).
import PDFDocument from 'pdfkit';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve an image URL from the API to an absolute file path on disk.
function resolveUploadPath(url) {
  if (!url) return null;
  let cleaned = url.replace(/^\/+/, '').replace(/^api\//, '');
  if (!cleaned.startsWith('uploads/')) return null;
  const basename = cleaned.replace(/^uploads\//, '');
  const candidates = [
    path.resolve(process.cwd(), 'uploads', basename),
    path.resolve('/code/server/uploads', basename),
    path.resolve(__dirname, '../../uploads', basename),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

// Build an absolute URL for an attachment. If `url` is already absolute
// (http/https) it's returned as-is; otherwise it's joined with the public
// base URL. The public base is provided by the caller (HTTP request host
// for /api routes, env var or fallback for MCP).
function absoluteAttachmentUrl(url, publicBaseUrl) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (publicBaseUrl || '').replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return base ? `${base}${path}` : path;
}

// Draw a clickable link (underlined, in the link color) at (x,y) of
// the given width. Returns the y advance so the caller can stack items.
function drawClickableLink(doc, x, y, width, label, href) {
  if (!href) return 0;
  doc.save();
  doc.fillColor(COLOR.info)
     .font('Helvetica')
     .fontSize(9)
     .text(label, x, y, { width, link: href, underline: true, lineBreak: false });
  doc.restore();
  return 12;
}

async function fetchImageBuffer(url, timeoutMs = 4000) {
  const localPath = resolveUploadPath(url);
  if (localPath) {
    try { return fs.promises.readFile(localPath); } catch (_) { return null; }
  }
  if (!url.startsWith('http')) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  } catch (_) { return null; }
}

// === Color palette ===
const COLOR = {
  bg: '#0f172a', card: '#1e293b', text: '#e2e8f0', muted: '#94a3b8',
  accent: '#FF6A00', border: '#334155',
  success: '#22c55e', warn: '#f59e0b', danger: '#ef4444', info: '#3b82f6',
};
const STATUS_LABELS = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho' };
const STATUS_COLORS = { pendiente: COLOR.muted, en_curso: COLOR.accent, hecho: COLOR.success };
const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const PRIORITY_COLORS = { baja: COLOR.success, media: COLOR.warn, alta: COLOR.danger };
const PROJECT_STATUS_LABELS = { activo: 'Activo', pausado: 'Pausado', completado: 'Completado' };
const PROJECT_STATUS_COLORS = { activo: COLOR.success, pausado: COLOR.warn, completado: COLOR.info };

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function pageW(doc) { return doc.page.width; }
function pageH(doc) { return doc.page.height; }
export const MARGIN_LEFT = 50;
export const MARGIN_RIGHT = 50;
export const MARGIN_TOP = 50;
export const MARGIN_BOTTOM = 60;
const CONTENT_W = 612 - 100;
function safeBottom(doc) { return pageH(doc) - MARGIN_BOTTOM; }

function newPage(doc, pageState) {
  doc.addPage();
  doc.rect(0, 0, pageW(doc), pageH(doc)).fill(COLOR.bg);
  doc.x = MARGIN_LEFT;
  doc.y = MARGIN_TOP;
  if (pageState) pageState.current += 1;
}

function ensureSpace(doc, pageState, needed = 30) {
  if (doc.y + needed > safeBottom(doc)) {
    newPage(doc, pageState);
  }
}

function paintFooter(doc, pageNum, totalPages) {
  const y1 = pageH(doc) - 30;
  const y2 = pageH(doc) - 18;
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
     .text(`Aguitech Core · Reporte generado el ${new Date().toLocaleString('es-MX')}`,
           MARGIN_LEFT, y1, { width: CONTENT_W, align: 'center', lineBreak: false });
  doc.text(`Página ${pageNum} de ${totalPages}`,
           MARGIN_LEFT, y2, { width: CONTENT_W, align: 'center', lineBreak: false });
  doc.x = MARGIN_LEFT;
  doc.y = MARGIN_TOP;
}

function drawPill(doc, x, y, label, bgColor) {
  const w = doc.widthOfString(label, { font: 'Helvetica-Bold', size: 9 }) + 16;
  doc.save();
  doc.roundedRect(x, y, w, 16, 8).fill(bgColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(label, x + 8, y + 4);
  doc.restore();
  return w;
}

function drawSectionHead(doc, pageState, title) {
  ensureSpace(doc, pageState, 40);
  doc.save();
  doc.rect(doc.x, doc.y, 3, 18).fill(COLOR.accent);
  doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(14)
     .text(title, doc.x + 10, doc.y, { width: CONTENT_W - 10 });
  doc.moveDown(0.6);
  doc.restore();
}

function infoRow(doc, label, value) {
  if (value === null || value === undefined || value === '') value = '—';
  const labelStr = `${label}:`;
  doc.font('Helvetica-Bold').fillColor(COLOR.muted).fontSize(9)
     .text(labelStr, { continued: true, width: CONTENT_W });
  doc.font('Helvetica').fillColor(COLOR.text)
     .text(`  ${value}`, { width: CONTENT_W });
}

// Load the project + tasks according to membership rules.
// Returns { project, tasks, total, byStatus, byPriority, weighted, overdue,
//           upcoming, memberStats, allComments, now } or null if not found.
export async function loadProjectReportData(projectId, userId) {
  const project = await Project.findOne({
    _id: projectId,
    $or: [{ owner: userId }, { 'members.user': userId }],
  })
    .populate('client', 'name company email status phone')
    .populate('members.user', 'name email role')
    .populate('owner', 'name email role');
  if (!project) return null;

  const tasks = await Task.find({ project: project._id })
    .populate('owner', 'name email')
    .populate('assignee', 'name email')
    .populate('comments.author', 'name email')
    .sort({ dueDate: 1, createdAt: -1 });

  const total = tasks.length;
  const byStatus = { pendiente: 0, en_curso: 0, hecho: 0 };
  const byPriority = { baja: 0, media: 0, alta: 0 };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  }
  const WEIGHTS = { hecho: 100, en_curso: 50, pendiente: 0 };
  const weighted = total === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + (WEIGHTS[t.status] || 0), 0) / total);
  const now = new Date();
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'hecho');
  const upcoming = tasks.filter(t => t.dueDate && new Date(t.dueDate) >= now && t.status !== 'hecho')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const memberStats = (project.members || []).map((m) => {
    const userId = m.user._id.toString();
    const owned = tasks.filter(t => t.owner && t.owner._id.toString() === userId).length;
    const completed = tasks.filter(t => t.owner && t.owner._id.toString() === userId && t.status === 'hecho').length;
    return { user: m.user, role: m.role, tasksOwned: owned, tasksCompleted: completed };
  });

  const allComments = [];
  for (const t of tasks) {
    for (const c of (t.comments || [])) {
      allComments.push({ text: c.text, author: c.author, createdAt: c.createdAt, taskTitle: t.title });
    }
  }
  allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { project, tasks, total, byStatus, byPriority, weighted, overdue, upcoming, memberStats, allComments, now };
}

// Render the report into a PDFKit doc. Caller is responsible for
// piping the doc and calling doc.end() after this returns.
// `publicBaseUrl` is used to build absolute URLs for attachment links
// (so document/video/image filenames become clickable hyperlinks in the PDF).
export async function renderProjectReportPdf(doc, data, requester, publicBaseUrl = '') {
  const { project, tasks, total, byStatus, byPriority, weighted, overdue, memberStats, allComments, now } = data;

  const pageState = { current: 1, total: 1 };
  doc.on('pageAdded', () => { pageState.total = pageState.current + 1; });

  // ============== COVER ==============
  doc.rect(0, 0, pageW(doc), pageH(doc)).fill(COLOR.bg);
  doc.rect(0, 0, pageW(doc), 8).fill(COLOR.accent);
  doc.x = MARGIN_LEFT;
  doc.y = 80;

  doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(28)
     .text('Aguitech Core', MARGIN_LEFT, 80, { width: CONTENT_W });
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11)
     .text('Reporte de Proyecto', MARGIN_LEFT, 115, { width: CONTENT_W });

  doc.moveTo(MARGIN_LEFT, 145).lineTo(MARGIN_LEFT + CONTENT_W, 145)
     .strokeColor(COLOR.border).lineWidth(1).stroke();

  doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(32)
     .text(project.title, MARGIN_LEFT, 180, { width: CONTENT_W });

  drawPill(doc, MARGIN_LEFT, 240,
           PROJECT_STATUS_LABELS[project.status] || project.status,
           PROJECT_STATUS_COLORS[project.status] || COLOR.muted);

  // === Big stats row ===
  const statsTopY = 290;
  const colCount = 4;
  const colGap = 16;
  const colW = (CONTENT_W - colGap * (colCount - 1)) / colCount;
  const statsData = [
    { label: 'TAREAS',   value: String(total) },
    { label: 'AVANCE',   value: `${weighted}%` },
    { label: 'MIEMBROS', value: String((project.members || []).length + 1) },
    { label: 'VENCIDAS', value: String(overdue.length) },
  ];
  const overdueColor = overdue.length > 0 ? COLOR.danger : COLOR.accent;
  for (let i = 0; i < colCount; i++) {
    const cx = MARGIN_LEFT + i * (colW + colGap);
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10)
       .text(statsData[i].label, cx, statsTopY, { characterSpacing: 1, width: colW });
    const valueColor = (i === 3 && overdue.length > 0) ? overdueColor : COLOR.accent;
    doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(32)
       .text(statsData[i].value, cx, statsTopY + 16, { width: colW });
  }
  doc.y = statsTopY + 60;

  // Client card
  const clientCardY = doc.y;
  const clientCardH = 90;
  doc.rect(MARGIN_LEFT, clientCardY, CONTENT_W, clientCardH).fill(COLOR.card);
  doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
     .text('CLIENTE', MARGIN_LEFT + 15, clientCardY + 12, { characterSpacing: 1, width: CONTENT_W - 30 });
  doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(16)
     .text(project.client?.name || '—', MARGIN_LEFT + 15, clientCardY + 28, { width: CONTENT_W - 30 });
  if (project.client?.company) {
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11)
       .text(project.client.company, MARGIN_LEFT + 15, clientCardY + 50, { width: CONTENT_W - 30 });
  }
  if (project.client?.email) {
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10)
       .text('Email: ' + project.client.email, MARGIN_LEFT + 15, clientCardY + 65, { width: CONTENT_W - 30 });
  }
  doc.y = clientCardY + clientCardH + 20;

  // Period & budget
  if (project.startDate || project.endDate || project.budget) {
    const periodY = doc.y;
    doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
       .text('PERÍODO Y PRESUPUESTO', MARGIN_LEFT, periodY, { characterSpacing: 1, width: CONTENT_W });
    doc.fillColor(COLOR.text).font('Helvetica').fontSize(11)
       .text(`${fmtDate(project.startDate)}  --  ${fmtDate(project.endDate)}`,
             MARGIN_LEFT, periodY + 14, { width: CONTENT_W });
    if (project.budget) {
      doc.font('Helvetica-Bold').fillColor(COLOR.text).fontSize(11)
         .text(`Presupuesto: ${fmtCurrency(project.budget)}`,
               MARGIN_LEFT, periodY + 32, { width: CONTENT_W });
    }
    doc.y = periodY + 55;
  }

  // Cover attribution
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
     .text(`Generado por ${requester?.name || requester?.email || 'Aguitech Core'} el ${new Date().toLocaleString('es-MX')}`,
           MARGIN_LEFT, clientCardY + clientCardH + 60,
           { align: 'center', width: CONTENT_W });
  doc.y = safeBottom(doc) + 1;

  // ============== INFO ==============
  newPage(doc, pageState);
  drawSectionHead(doc, pageState, 'Información del Proyecto');
  doc.moveDown(0.4);

  infoRow(doc, 'Título', project.title);
  infoRow(doc, 'Cliente', project.client?.name);
  if (project.client?.company) infoRow(doc, 'Empresa', project.client.company);
  if (project.client?.email) infoRow(doc, 'Email cliente', project.client.email);
  if (project.client?.phone) infoRow(doc, 'Teléfono cliente', project.client.phone);
  infoRow(doc, 'Estado', PROJECT_STATUS_LABELS[project.status] || project.status);
  infoRow(doc, 'Progreso manual', `${project.progress}%`);
  infoRow(doc, 'Progreso ponderado', `${weighted}%`);
  infoRow(doc, 'Inicio', fmtDate(project.startDate));
  infoRow(doc, 'Entrega', fmtDate(project.endDate));
  if (project.budget) infoRow(doc, 'Presupuesto', fmtCurrency(project.budget));
  infoRow(doc, 'Responsable', project.owner?.name);
  infoRow(doc, 'Creado', fmtDate(project.createdAt));
  doc.moveDown(0.5);

  if (project.description) {
    ensureSpace(doc, pageState, 60);
    doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(10)
       .text('DESCRIPCIÓN', { characterSpacing: 1, width: CONTENT_W });
    doc.moveDown(0.3);
    doc.fillColor(COLOR.text).font('Helvetica').fontSize(11)
       .text(project.description, { align: 'justify', width: CONTENT_W });
    doc.moveDown(0.6);
  }

  // ============== STATS ==============
  drawSectionHead(doc, pageState, 'Resumen de Tareas');
  doc.moveDown(0.3);

  ensureSpace(doc, pageState, 40);
  let cursorX = doc.x;
  const row1Y = doc.y;
  for (const [k, v] of Object.entries(byStatus)) {
    const w = drawPill(doc, cursorX, row1Y, `${STATUS_LABELS[k]}: ${v}`, STATUS_COLORS[k]);
    cursorX += w + 8;
  }
  doc.y = row1Y + 22;

  ensureSpace(doc, pageState, 30);
  cursorX = doc.x;
  const row2Y = doc.y;
  for (const [k, v] of Object.entries(byPriority)) {
    const w = drawPill(doc, cursorX, row2Y, `${PRIORITY_LABELS[k]}: ${v}`, PRIORITY_COLORS[k]);
    cursorX += w + 8;
  }
  doc.y = row2Y + 28;

  if (overdue.length > 0) {
    ensureSpace(doc, pageState, 32);
    const wY = doc.y;
    doc.rect(doc.x, wY, CONTENT_W, 24).fill('#7f1d1d');
    doc.fillColor('#fecaca').font('Helvetica-Bold').fontSize(11)
       .text(`! ${overdue.length} tarea(s) vencida(s) sin completar`,
             doc.x + 10, wY + 7, { width: CONTENT_W - 20 });
    doc.y = wY + 30;
  }

  // ============== TEAM ==============
  drawSectionHead(doc, pageState, 'Miembros del Equipo');
  doc.moveDown(0.3);

  if ((project.members || []).length === 0) {
    doc.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(10)
       .text('Sin miembros adicionales (solo el responsable).', { width: CONTENT_W });
    doc.moveDown(0.6);
  } else {
    for (const m of memberStats) {
      ensureSpace(doc, pageState, 36);
      doc.font('Helvetica-Bold').fillColor(COLOR.text).fontSize(11)
         .text(m.user.name, { continued: true, width: CONTENT_W });
      doc.font('Helvetica').fillColor(COLOR.muted)
         .text(`  ·  ${m.role}`, { width: CONTENT_W });
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
         .text(`${m.tasksOwned} tarea(s) asignada(s)  ·  ${m.tasksCompleted} completada(s)  ·  ${m.user.email}`,
               { indent: 14, width: CONTENT_W - 14 });
      doc.moveDown(0.3);
    }
  }

  // ============== TASKS ==============
  newPage(doc, pageState);
  drawSectionHead(doc, pageState, `Tareas (${total})`);
  doc.moveDown(0.4);

  if (total === 0) {
    doc.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(11)
       .text('Sin tareas registradas en este proyecto.', { width: CONTENT_W });
  } else {
    const groups = [
      ['pendiente', 'Pendientes'],
      ['en_curso', 'En curso'],
      ['hecho', 'Completadas'],
    ];
    for (const [statusKey, groupLabel] of groups) {
      const group = tasks.filter(t => t.status === statusKey);
      if (group.length === 0) continue;

      ensureSpace(doc, pageState, 60);
      doc.fillColor(STATUS_COLORS[statusKey]).font('Helvetica-Bold').fontSize(13)
         .text(`${groupLabel} (${group.length})`, { width: CONTENT_W });
      doc.moveDown(0.3);

      for (const t of group) {
        const hasDesc = !!t.description;
        const imgCount = (t.images || []).length;
        const docCount = (t.documents || []).length + (t.videos || []).length;
        const commCount = (t.comments || []).length;

        const cardX = MARGIN_LEFT;
        const cardW = CONTENT_W;
        const innerW = cardW - 20;

        const titleFont = { font: 'Helvetica-Bold', size: 12 };
        const titleH = Math.max(22, doc.heightOfString(t.title, { ...titleFont, width: innerW - 110 }) + 4);

        let cardH = titleH + 16;
        if (hasDesc) cardH += doc.heightOfString(t.description, { font: 'Helvetica', size: 9, width: innerW }) + 12;
        if (imgCount > 0) {
          cardH += 110;                                  // thumbnail row
          // Clickable link rows for image filenames
          const imgLinkCols = Math.max(1, Math.ceil(imgCount * 90 / innerW));
          cardH += imgLinkCols * 12 + 6;
        }
        if (docCount > 0) cardH += 16 + Math.min(docCount, 6) * 12 + (docCount > 6 ? 12 : 0);
        if (commCount > 0) {
          cardH += 14;
          for (const c of (t.comments || []).slice(0, 3)) {
            cardH += doc.heightOfString(`${c.author?.name || '?'}: ${c.text}`,
                                        { font: 'Helvetica', size: 9, width: innerW - 14 }) + 2;
          }
        }
        cardH += 12;

        if (doc.y + cardH > safeBottom(doc)) {
          newPage(doc, pageState);
        }

        const cardY = doc.y;
        doc.save();
        doc.rect(cardX, cardY, cardW, cardH).fill(COLOR.card).stroke(COLOR.border);
        doc.restore();

        doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(12)
           .text(t.title, cardX + 10, cardY + 8, { width: innerW - 110 });

        drawPill(doc, cardX + cardW - 100, cardY + 8,
                 STATUS_LABELS[t.status] || t.status, STATUS_COLORS[t.status] || COLOR.muted);

        const metaBits = [];
        if (t.dueDate) {
          const isOverdue = new Date(t.dueDate) < now && t.status !== 'hecho';
          metaBits.push(`Fecha: ${fmtDate(t.dueDate)}${isOverdue ? '  (VENCIDA)' : ''}`);
        }
        if (t.owner?.name) metaBits.push(`Owner: ${t.owner.name}`);
        if (t.assignee?.name) metaBits.push(`Responsable: ${t.assignee.name}`);
        const metaY = cardY + 8 + titleH + 2;
        if (metaBits.length) {
          doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
             .text(metaBits.join('   ·   '), cardX + 10, metaY, { width: innerW });
        }

        let cursorY = metaY + 14;

        if (hasDesc) {
          const descH = doc.heightOfString(t.description, { font: 'Helvetica', size: 9, width: innerW });
          doc.fillColor(COLOR.text).font('Helvetica').fontSize(9)
             .text(t.description, cardX + 10, cursorY, { width: innerW });
          cursorY += descH + 8;
        }

        if (imgCount > 0) {
          doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
             .text(`Imagenes adjuntas (${imgCount}):`, cardX + 10, cursorY, { width: innerW });
          cursorY += 12;

          const slots = Math.min(imgCount, 3);
          const imagePromises = (t.images || []).slice(0, slots).map(img => fetchImageBuffer(img.url));
          const imageBufs = await Promise.all(imagePromises);
          const slotW = (innerW - (slots - 1) * 8) / slots;
          for (let i = 0; i < slots; i++) {
            const buf = imageBufs[i];
            const ix = cardX + 10 + i * (slotW + 8);
            const iy = cursorY;
            const imgMeta = t.images[i];
            const imgHref = absoluteAttachmentUrl(imgMeta.url, publicBaseUrl);
            if (buf) {
              try {
                doc.image(buf, ix, iy, { fit: [slotW, 90], align: 'center', valign: 'center' });
                // Wrap the rendered image in a clickable link rectangle so the
                // thumbnail itself opens the file in the user's viewer.
                if (imgHref) doc.link(ix, iy, slotW, 90, imgHref);
              } catch (_) {
                doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
                if (imgHref) doc.link(ix, iy, slotW, 90, imgHref);
                doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                   .text('(no embedida)', ix, iy + 40, { width: slotW, align: 'center' });
              }
            } else {
              doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
              if (imgHref) doc.link(ix, iy, slotW, 90, imgHref);
              doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                 .text(imgMeta.filename.slice(0, 22), ix, iy + 40, { width: slotW, align: 'center' });
            }
          }
          cursorY += 96;

          // List every image filename as a clickable link (full URLs) so the
          // user can open them even if the thumbnail is empty.
          const linkStartY = cursorY;
          let linkX = cardX + 10;
          let linkY = cursorY;
          const linkColW = innerW;
          let colUsed = 0;
          for (const imgMeta of (t.images || [])) {
            const href = absoluteAttachmentUrl(imgMeta.url, publicBaseUrl);
            const label = `[IMG] ${imgMeta.filename}`;
            const labelW = doc.widthOfString(label, { font: 'Helvetica', size: 9, underline: true }) + 18;
            if (colUsed + labelW > linkColW) {
              linkX = cardX + 10;
              linkY += 12;
              colUsed = 0;
            }
            if (href) doc.link(linkX, linkY, Math.min(labelW, linkColW - colUsed), 12, href);
            doc.fillColor(COLOR.info).font('Helvetica').fontSize(9)
               .text(label, linkX, linkY, { width: Math.min(labelW, linkColW - colUsed), underline: true, lineBreak: false });
            linkX += Math.min(labelW, linkColW - colUsed);
            colUsed += Math.min(labelW, linkColW - colUsed);
          }
          if ((t.images || []).length > 0 && linkY > linkStartY) cursorY = linkY + 14;
          else if ((t.images || []).length > 0) cursorY = linkStartY + 14;

          if (imgCount > slots) {
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
               .text(`... y ${imgCount - slots} imagen(es) más`, cardX + 10, cursorY, { width: innerW });
            cursorY += 10;
          }
        }

        if (docCount > 0) {
          const items = [
            ...(t.documents || []).map(d => ({ kind: 'DOC',    label: d.filename, url: d.url })),
            ...(t.videos   || []).map(v => ({ kind: 'VIDEO', label: v.filename, url: v.url })),
          ];
          doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
             .text(`Adjuntos (${items.length}):`, cardX + 10, cursorY, { width: innerW });
          cursorY += 12;
          // Render each attachment as a clickable, underlined link. The label
          // shows the kind tag + filename; the link target is the absolute URL.
          for (const it of items.slice(0, 6)) {
            const href = absoluteAttachmentUrl(it.url, publicBaseUrl);
            const label = `[${it.kind}] ${it.label}`;
            ensureSpace(doc, pageState, 14);
            doc.fillColor(COLOR.info).font('Helvetica').fontSize(9)
               .text(label, cardX + 14, cursorY, { width: innerW - 4, link: href, underline: true, lineBreak: false });
            cursorY += 12;
          }
          if (items.length > 6) {
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
               .text(`... y ${items.length - 6} adjunto(s) más`, cardX + 14, cursorY, { width: innerW });
            cursorY += 12;
          }
        }

        if (commCount > 0) {
          doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
             .text(`Comentarios (${commCount}):`, cardX + 10, cursorY, { width: innerW });
          cursorY += 12;
          for (const c of (t.comments || []).slice(0, 3)) {
            const txt = `${c.author?.name || '?'}: ${c.text}`;
            const cH = doc.heightOfString(txt, { font: 'Helvetica', size: 9, width: innerW - 14 });
            doc.fillColor(COLOR.text).font('Helvetica').fontSize(9)
               .text(`• ${txt}`, cardX + 14, cursorY, { width: innerW - 14 });
            cursorY += cH + 2;
          }
        }

        doc.y = cardY + cardH + 8;
        doc.x = MARGIN_LEFT;
      }
    }
  }

  // ============== ACTIVITY ==============
  if (allComments.length > 0) {
    newPage(doc, pageState);
    drawSectionHead(doc, pageState, `Actividad Reciente (${allComments.length})`);
    doc.moveDown(0.4);

    for (const c of allComments.slice(0, 30)) {
      ensureSpace(doc, pageState, 40);
      doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(10)
         .text(`${c.author?.name || '—'}  `, { continued: true, width: CONTENT_W });
      doc.font('Helvetica').fillColor(COLOR.muted).fontSize(9)
         .text(`comentó en "${c.taskTitle}" · ${new Date(c.createdAt).toLocaleString('es-MX')}`,
               { width: CONTENT_W });
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(10)
         .text(c.text, { indent: 14, width: CONTENT_W - 14 });
      doc.moveDown(0.5);
    }
  }

  // ============== FOOTERS ==============
  const range = doc.bufferedPageRange();
  const totalBuffered = range.count;
  let lastReal = range.start;
  for (let idx = range.start; idx < range.start + totalBuffered; idx++) {
    try {
      doc.switchToPage(idx);
      const buf = doc._pageBuffer;
      const bufLen = Array.isArray(buf) ? buf.length : (buf && buf.length ? buf.length : 0);
      if (bufLen > 200) lastReal = idx;
    } catch (_) {}
  }
  const realCount = lastReal - range.start + 1;
  for (let idx = range.start + 1; idx <= lastReal; idx++) {
    try {
      doc.switchToPage(idx);
      paintFooter(doc, idx - range.start + 1, realCount);
    } catch (_) {}
  }
}

// High-level helper: build a PDF in memory and return the Buffer.
// Used by MCP tool `generate_project_report`.
export async function buildProjectReportPdf(projectId, requester, publicBaseUrl = '') {
  const data = await loadProjectReportData(projectId, requester._id);
  if (!data) return null;
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    info: {
      Title: `Proyecto: ${data.project.title}`,
      Author: data.project.owner?.name || 'Aguitech Core',
      Subject: 'Reporte de proyecto',
      Creator: 'Aguitech Core',
    },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  await renderProjectReportPdf(doc, data, requester, publicBaseUrl);
  doc.end();
  return done;
}
