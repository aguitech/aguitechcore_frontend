// PDF export for project detail.
// Streams a professional PDF report directly to the HTTP response.
//
// Sections:
//   1. Cover page            (brand, title, status, big stats, client card)
//   2. Project info          (all metadata + description)
//   3. Stats summary         (status + priority pills, overdue warning)
//   4. Team members          (name, role, task counts, email)
//   5. Tasks                 (grouped by status, cards with embedded images, docs, comments)
//   6. Recent activity       (chronological comments — only if any)
//   Footer on every page     (timestamp + page number)
//
// Notes:
// - No emoji glyphs in the body (they render as garbled tofu in default
//   PDF Helvetica). Use ASCII bullets / labels instead.
// - Every doc.text() call passes an explicit `width` so pdfkit auto-wraps
//   and respects page breaks.
// - Long task cards break to a new page cleanly via doc.moveDown() checks
//   and an explicit page-break before rendering the card if it won't fit.
import PDFDocument from 'pdfkit';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve an image URL from the API to an absolute file path on disk.
// URLs look like "/api/uploads/abc.png" or "/uploads/abc.png".
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
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
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

// === Color palette (matches the dark Aguittech theme) ===
const COLOR = {
  bg: '#0f172a',
  card: '#1e293b',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#FF6A00',
  border: '#334155',
  success: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
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

// Page geometry constants — recomputed every time we need them, since
// PDFDocument exposes current page size via doc.page.{width,height}.
function pageW(doc) { return doc.page.width; }
function pageH(doc) { return doc.page.height; }
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60; // leave room for footer
const CONTENT_W = 612 - 100; // US Letter (612) minus margins
// Safe Y where content may go (above footer area)
function safeBottom(doc) { return pageH(doc) - MARGIN_BOTTOM; }

// Force a page break (used between sections). Just calls addPage and
// resets the cursor — bg is repainted and footer is added by the trailing
// global footer loop (see end of controller), which uses switchToPage and
// is robust against the buffer-range quirks of pdfkit.
function newPage(doc, pageState) {
  doc.addPage();
  doc.rect(0, 0, pageW(doc), pageH(doc)).fill(COLOR.bg);
  doc.x = MARGIN_LEFT;
  doc.y = MARGIN_TOP;
  if (pageState) pageState.current += 1;
}

// Ensure current cursor Y has enough room for `needed` more pixels.
function ensureSpace(doc, pageState, needed = 30) {
  if (doc.y + needed > safeBottom(doc)) {
    newPage(doc, pageState);
  }
}

// Footer text. Drawn at the bottom of the current page.
function drawPageFooter(doc, pageNum, totalPages) {
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
     .text(`Aguitech Core · Reporte generado el ${new Date().toLocaleString('es-MX')}`,
           MARGIN_LEFT, pageH(doc) - 30, { width: CONTENT_W, align: 'center' });
  doc.text(`Pagina ${pageNum} de ${totalPages}`,
           MARGIN_LEFT, pageH(doc) - 18, { width: CONTENT_W, align: 'center' });
}

// Colored status pill: returns width used.
function drawPill(doc, x, y, label, bgColor) {
  const w = doc.widthOfString(label, { font: 'Helvetica-Bold', size: 9 }) + 16;
  doc.save();
  doc.roundedRect(x, y, w, 16, 8).fill(bgColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(label, x + 8, y + 4);
  doc.restore();
  return w;
}

// Section heading: colored left bar + bold title. Always width-bound.
function drawSectionHead(doc, pageState, title) {
  ensureSpace(doc, pageState, 40);
  doc.save();
  doc.rect(doc.x, doc.y, 3, 18).fill(COLOR.accent);
  doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(14)
     .text(title, doc.x + 10, doc.y, { width: CONTENT_W - 10 });
  doc.moveDown(0.6);
  doc.restore();
}

// Two-column info row inside a card. Both label and value flow inside width.
function infoRow(doc, label, value) {
  if (value === null || value === undefined || value === '') value = '—';
  const labelStr = `${label}:`;
  doc.font('Helvetica-Bold').fillColor(COLOR.muted).fontSize(9)
     .text(labelStr, { continued: true, width: CONTENT_W });
  doc.font('Helvetica').fillColor(COLOR.text)
     .text(`  ${value}`, { width: CONTENT_W });
}

export async function exportProjectPdf(req, res, next) {
  try {
    // 1) Load data
    const project = await Project.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
      ],
    })
      .populate('client', 'name company email status phone')
      .populate('members.user', 'name email role')
      .populate('owner', 'name email role');
    if (!project) return res.status(404).json({ message: 'Proyecto no encontrado' });

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
        allComments.push({
          text: c.text,
          author: c.author,
          createdAt: c.createdAt,
          taskTitle: t.title,
        });
      }
    }
    allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 2) Build PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
      info: {
        Title: `Proyecto: ${project.title}`,
        Author: project.owner?.name || 'Aguitech Core',
        Subject: 'Reporte de proyecto',
        Creator: 'Aguitech Core',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    const safeName = project.title.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="proyecto_${safeName}.pdf"`);
    doc.pipe(res);

    // Page counter — incremented every time newPage() is called.
    // The cover (page 1) starts at 1 and gets its own centered footer.
    const pageState = { current: 1 };

    // ============== PAGE 1: COVER ==============
    doc.rect(0, 0, pageW(doc), pageH(doc)).fill(COLOR.bg);
    doc.rect(0, 0, pageW(doc), 8).fill(COLOR.accent);
    doc.x = MARGIN_LEFT;
    doc.y = 80;

    doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(28)
       .text('Aguitech Core', { width: CONTENT_W });
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11)
       .text('Reporte de Proyecto', { width: CONTENT_W });

    doc.moveTo(MARGIN_LEFT, doc.y + 5).lineTo(MARGIN_LEFT + CONTENT_W, doc.y + 5)
       .strokeColor(COLOR.border).lineWidth(1).stroke();
    doc.y += 25;

    // Project title big
    doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(32)
       .text(project.title, { width: CONTENT_W });
    doc.moveDown(0.8);

    // Status pill
    drawPill(doc, doc.x, doc.y, PROJECT_STATUS_LABELS[project.status] || project.status,
             PROJECT_STATUS_COLORS[project.status] || COLOR.muted);
    doc.moveDown(2.5);

    // Big stats
    const drawBigStat = (label, value, x) => {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10)
         .text(label.toUpperCase(), x, doc.y, { characterSpacing: 1, width: 110 });
      doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(28)
         .text(String(value), x, doc.y, { width: 110 });
    };
    const statsY = doc.y;
    drawBigStat('Tareas', total, MARGIN_LEFT);
    drawBigStat('Avance', `${weighted}%`, MARGIN_LEFT + 130);
    drawBigStat('Miembros', (project.members || []).length + 1, MARGIN_LEFT + 260);
    drawBigStat('Vencidas', overdue.length, MARGIN_LEFT + 390);
    doc.y = statsY + 70;

    // Client card
    doc.rect(MARGIN_LEFT, doc.y, CONTENT_W, 80).fill(COLOR.card);
    const cy = doc.y;
    doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
       .text('CLIENTE', MARGIN_LEFT + 15, cy + 12, { characterSpacing: 1, width: CONTENT_W - 30 });
    doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(16)
       .text(project.client?.name || '—', MARGIN_LEFT + 15, cy + 28, { width: CONTENT_W - 30 });
    if (project.client?.company) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11)
         .text(project.client.company, MARGIN_LEFT + 15, cy + 50, { width: CONTENT_W - 30 });
    }
    if (project.client?.email) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10)
         .text('Email: ' + project.client.email, MARGIN_LEFT + 15, cy + 65, { width: CONTENT_W - 30 });
    }
    doc.y = cy + 95;

    // Period & budget
    if (project.startDate || project.endDate || project.budget) {
      doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9)
         .text('PERÍODO Y PRESUPUESTO', { characterSpacing: 1, width: CONTENT_W });
      doc.moveDown(0.2);
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(11)
         .text(`${fmtDate(project.startDate)}  --  ${fmtDate(project.endDate)}`, { width: CONTENT_W });
      if (project.budget) {
        doc.font('Helvetica-Bold').fillColor(COLOR.text).fontSize(11)
           .text(`Presupuesto: ${fmtCurrency(project.budget)}`, { width: CONTENT_W });
      }
      doc.moveDown(0.5);
    }

    // Cover footer
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
       .text(`Generado el ${new Date().toLocaleString('es-MX')} por ${req.user.name || req.user.email}`,
             MARGIN_LEFT, pageH(doc) - 80,
             { align: 'center', width: CONTENT_W });

    // ============== PAGE 2: PROJECT INFO ==============
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

    // Status pills
    ensureSpace(doc, pageState, 40);
    let cursorX = doc.x;
    const row1Y = doc.y;
    for (const [k, v] of Object.entries(byStatus)) {
      const w = drawPill(doc, cursorX, row1Y, `${STATUS_LABELS[k]}: ${v}`, STATUS_COLORS[k]);
      cursorX += w + 8;
    }
    doc.y = row1Y + 22;

    // Priority pills
    ensureSpace(doc, pageState, 30);
    cursorX = doc.x;
    const row2Y = doc.y;
    for (const [k, v] of Object.entries(byPriority)) {
      const w = drawPill(doc, cursorX, row2Y, `${PRIORITY_LABELS[k]}: ${v}`, PRIORITY_COLORS[k]);
      cursorX += w + 8;
    }
    doc.y = row2Y + 28;

    // Overdue warning
    if (overdue.length > 0) {
      ensureSpace(doc, pageState, 32);
      const wY = doc.y;
      doc.rect(doc.x, wY, CONTENT_W, 24).fill('#7f1d1d');
      doc.fillColor('#fecaca').font('Helvetica-Bold').fontSize(11)
         .text(`! ${overdue.length} tarea(s) vencida(s) sin completar`,
               doc.x + 10, wY + 7, { width: CONTENT_W - 20 });
      doc.y = wY + 30;
    }

    // ============== TEAM MEMBERS ==============
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
          // === Compute card height up-front so we can page-break cleanly ===
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
          if (imgCount > 0) cardH += 110;
          if (docCount > 0) cardH += 16;
          if (commCount > 0) {
            cardH += 14;
            for (const c of (t.comments || []).slice(0, 3)) {
              cardH += doc.heightOfString(`${c.author?.name || '?'}: ${c.text}`,
                                          { font: 'Helvetica', size: 9, width: innerW - 14 }) + 2;
            }
          }
          cardH += 12; // padding bottom

          // If the whole card won't fit, jump to a fresh page and reset bg
          if (doc.y + cardH > safeBottom(doc)) {
            newPage(doc, pageState);
          }

          const cardY = doc.y;

          // Card background
          doc.save();
          doc.rect(cardX, cardY, cardW, cardH).fill(COLOR.card).stroke(COLOR.border);
          doc.restore();

          // Title (left, width-bound)
          doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(12)
             .text(t.title, cardX + 10, cardY + 8, { width: innerW - 110 });

          // Status pill (right side, anchored to top of card)
          drawPill(doc, cardX + cardW - 100, cardY + 8,
                   STATUS_LABELS[t.status] || t.status, STATUS_COLORS[t.status] || COLOR.muted);

          // Meta line
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

          // Description
          if (hasDesc) {
            const descH = doc.heightOfString(t.description, { font: 'Helvetica', size: 9, width: innerW });
            doc.fillColor(COLOR.text).font('Helvetica').fontSize(9)
               .text(t.description, cardX + 10, cursorY, { width: innerW });
            cursorY += descH + 8;
          }

          // Images
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
              if (buf) {
                try { doc.image(buf, ix, iy, { fit: [slotW, 90], align: 'center', valign: 'center' }); }
                catch (_) {
                  doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
                  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                     .text('(no embedida)', ix, iy + 40, { width: slotW, align: 'center' });
                }
              } else {
                doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
                doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                   .text(t.images[i].filename.slice(0, 22), ix, iy + 40, { width: slotW, align: 'center' });
              }
            }
            cursorY += 96;

            if (imgCount > slots) {
              doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                 .text(`... y ${imgCount - slots} imagen(es) más`, cardX + 10, cursorY, { width: innerW });
              cursorY += 10;
            }
          }

          // Documents / videos
          if (docCount > 0) {
            const items = [
              ...(t.documents || []).map(d => `[DOC] ${d.filename}`),
              ...(t.videos || []).map(v => `[VIDEO] ${v.filename}`),
            ];
            const shown = items.slice(0, 4).join('   ·   ');
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
               .text(`Adjuntos: ${shown}`, cardX + 10, cursorY, { width: innerW });
            cursorY += 14;
            if (items.length > 4) {
              doc.text(`... y ${items.length - 4} adjunto(s) más`, { width: innerW });
              cursorY += 12;
            }
          }

          // Comments
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

          // Move cursor below the card for next iteration
          doc.y = cardY + cardH + 8;
          doc.x = MARGIN_LEFT;
        }
      }
    }

    // ============== RECENT ACTIVITY (only if there are comments) ==============
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

    // ============== FOOTER on every page ==============
    // Skip the cover (it has its own centered footer).
    // pdfkit may have created some "phantom" pages that only have the bg
    // rect and no content — skip those by checking the page buffer size.
    // We iterate over the buffered page range and only paint footers on
    // pages whose content stream is meaningfully large.
    const range = doc.bufferedPageRange();
    let lastRealPage = 0;
    // Pass 1: find the highest page index that has real content.
    for (let idx = range.start; idx < range.start + range.count; idx++) {
      doc.switchToPage(idx);
      const buf = doc._pageBuffer;
      const bufLen = Array.isArray(buf) ? buf.length : (buf && buf.length ? buf.length : 0);
      if (bufLen > 200) lastRealPage = idx;
    }
    // Pass 2: paint footers on each real-content page (skip cover).
    const totalReal = lastRealPage - range.start + 1;
    for (let idx = range.start; idx <= lastRealPage; idx++) {
      if (idx === range.start) continue; // skip cover
      doc.switchToPage(idx);
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
         .text(`Aguitech Core · Reporte generado el ${new Date().toLocaleString('es-MX')}`,
               MARGIN_LEFT, pageH(doc) - 30, { width: CONTENT_W, align: 'center' });
      doc.text(`Pagina ${idx - range.start + 1} de ${totalReal}`,
               MARGIN_LEFT, pageH(doc) - 18, { width: CONTENT_W, align: 'center' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
