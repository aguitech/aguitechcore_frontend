// PDF export for project detail.
// Streams a professional PDF report directly to the HTTP response.
// Includes: cover page, project metadata, stats, members with contributions,
// all tasks grouped by status, embedded task images, recent comments,
// and a list of all attached documents/videos.
//
// Requires: pdfkit (npm install pdfkit)
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
// Files live in /code/server/uploads/<basename>.
function resolveUploadPath(url) {
  if (!url) return null;
  // Strip leading slash and any /api prefix
  let cleaned = url.replace(/^\/+/, '');
  cleaned = cleaned.replace(/^api\//, '');
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

// Fetch a buffer for an image, with a short timeout so a single bad URL
// doesn't stall the entire PDF generation.
async function fetchImageBuffer(url, timeoutMs = 4000) {
  const localPath = resolveUploadPath(url);
  // Prefer local file (already on the server, no network)
  if (localPath) {
    try { return fs.promises.readFile(localPath); } catch (_) { return null; }
  }
  // Fallback: fetch from absolute URL with timeout
  if (!url.startsWith('http')) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  } catch (_) {
    return null;
  }
}

// --- Color palette (matches the dark Aguittech theme) ---
const COLOR = {
  bg: '#0f172a',
  card: '#1e293b',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#FF6A00',
  accentHover: '#ff8233',
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

// Draw a colored status pill on the doc.
function drawPill(doc, x, y, label, bgColor) {
  const w = doc.widthOfString(label, { font: 'Helvetica-Bold', size: 9 }) + 16;
  doc.save();
  doc.roundedRect(x, y, w, 16, 8).fill(bgColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(label, x + 8, y + 4);
  doc.restore();
  return w;
}

// Section heading: colored left bar + title text.
function drawSectionHead(doc, title) {
  if (doc.y > 720) doc.addPage();
  doc.save();
  doc.rect(doc.x, doc.y, 3, 18).fill(COLOR.accent);
  doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(14).text(title, doc.x + 10, doc.y);
  doc.moveDown(0.6);
  doc.restore();
}

// Info row inside a card: "Label:           Value"
function infoRow(doc, label, value) {
  if (!value && value !== 0) value = '—';
  doc.font('Helvetica-Bold').fillColor(COLOR.muted).fontSize(9).text(`${label}:`, { continued: true });
  doc.font('Helvetica').fillColor(COLOR.text).text(`  ${value}`);
}

export async function exportProjectPdf(req, res, next) {
  try {
    // 1) Load full project detail (same query as the frontend)
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

    // Aggregate stats (mirrors getProjectDetail)
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
          taskId: t._id,
        });
      }
    }
    allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 2) Build the PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
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

    // === COVER PAGE ===
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg);

    // Top accent bar
    doc.rect(0, 0, doc.page.width, 8).fill(COLOR.accent);

    // Brand
    doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(28).text('Aguitech Core', 50, 80);
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11).text('Reporte de Proyecto', 50, 115);

    // Decorative line
    doc.moveTo(50, 145).lineTo(doc.page.width - 50, 145).strokeColor(COLOR.border).lineWidth(1).stroke();

    // Project title (big)
    doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(32).text(project.title, 50, 180, { width: doc.page.width - 100 });

    // Status pill
    let pillY = doc.y + 15;
    drawPill(doc, 50, pillY, PROJECT_STATUS_LABELS[project.status] || project.status,
             PROJECT_STATUS_COLORS[project.status] || COLOR.muted);

    // Big stats block
    let sy = pillY + 50;
    const drawBigStat = (label, value, x) => {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10).text(label.toUpperCase(), x, sy, { characterSpacing: 1 });
      doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(28).text(String(value), x, sy + 14);
    };
    drawBigStat('Tareas', total, 50);
    drawBigStat('Avance', `${weighted}%`, 180);
    drawBigStat('Miembros', (project.members || []).length + 1, 310);
    drawBigStat('Vencidas', overdue.length, 440);

    // Client card
    let cy = sy + 80;
    doc.rect(50, cy, doc.page.width - 100, 90).fill(COLOR.card);
    doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9).text('CLIENTE', 65, cy + 15, { characterSpacing: 1 });
    doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(16).text(project.client?.name || '—', 65, cy + 32);
    if (project.client?.company) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(11).text(project.client.company, 65, cy + 55);
    }
    if (project.client?.email) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10).text(`📧 ${project.client.email}`, 65, cy + 70);
    }

    // Dates
    let dy = cy + 110;
    if (project.startDate || project.endDate || project.budget) {
      doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9).text('PERÍODO Y PRESUPUESTO', 50, dy, { characterSpacing: 1 });
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(11)
        .text(`${fmtDate(project.startDate)}  →  ${fmtDate(project.endDate)}`, 50, dy + 14);
      if (project.budget) {
        doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(11).text(`Presupuesto: ${fmtCurrency(project.budget)}`, 50, dy + 32);
      }
    }

    // Footer
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
      .text(`Generado el ${new Date().toLocaleString('es-MX')} por ${req.user.name || req.user.email}`,
            50, doc.page.height - 80, { align: 'center', width: doc.page.width - 100 });

    // === NEW PAGE: Project details + description ===
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg);
    drawSectionHead(doc, '📋 Información del Proyecto');

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

    if (project.description) {
      doc.moveDown(0.8);
      doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(10).text('DESCRIPCIÓN', { characterSpacing: 1 });
      doc.moveDown(0.3);
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(11).text(project.description, { align: 'justify' });
    }

    // === Stats section ===
    drawSectionHead(doc, '📊 Resumen de Tareas');
    doc.moveDown(0.4);

    // By status pills
    let bx = doc.x;
    const by = doc.y;
    let cursorX = bx;
    for (const [k, v] of Object.entries(byStatus)) {
      const w = drawPill(doc, cursorX, by, `${STATUS_LABELS[k]}: ${v}`, STATUS_COLORS[k]);
      cursorX += w + 10;
      if (cursorX > doc.page.width - 80) break;
    }
    doc.moveDown(1.2);

    // By priority
    doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(10).text('Por prioridad:', doc.x, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.3);
    cursorX = doc.x;
    const py = doc.y;
    for (const [k, v] of Object.entries(byPriority)) {
      const w = drawPill(doc, cursorX, py, `${PRIORITY_LABELS[k]}: ${v}`, PRIORITY_COLORS[k]);
      cursorX += w + 10;
    }
    doc.moveDown(1.5);

    // Overdue warning
    if (overdue.length > 0) {
      doc.rect(doc.x, doc.y, doc.page.width - 100, 24).fill('#7f1d1d');
      doc.fillColor('#fecaca').font('Helvetica-Bold').fontSize(11)
        .text(`⚠ ${overdue.length} tarea(s) vencida(s) sin completar`, doc.x + 10, doc.y + 6);
      doc.moveDown(1.2);
    }

    // === Members ===
    drawSectionHead(doc, '👥 Miembros del Equipo');
    doc.moveDown(0.4);
    if ((project.members || []).length === 0) {
      doc.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(10).text('Sin miembros adicionales (solo el responsable).');
      doc.moveDown(1);
    } else {
      for (const m of memberStats) {
        if (doc.y > 720) doc.addPage();
        doc.font('Helvetica-Bold').fillColor(COLOR.text).fontSize(11).text(`${m.user.name}`, { continued: true });
        doc.font('Helvetica').fillColor(COLOR.muted).text(`  ·  ${m.role}`);
        doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9)
          .text(`   ${m.tasksOwned} tarea(s) asignada(s)  ·  ${m.tasksCompleted} completada(s)  ·  ${m.user.email}`);
        doc.moveDown(0.3);
      }
    }

    // === TASKS (the meatiest section) ===
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg);
    drawSectionHead(doc, `✅ Tareas (${total})`);
    doc.moveDown(0.4);

    if (total === 0) {
      doc.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(11).text('Sin tareas registradas en este proyecto.');
    } else {
      // Group by status for readability
      const groups = [
        ['pendiente', 'Pendientes'],
        ['en_curso', 'En curso'],
        ['hecho', 'Completadas'],
      ];
      for (const [statusKey, groupLabel] of groups) {
        const group = tasks.filter(t => t.status === statusKey);
        if (group.length === 0) continue;

        if (doc.y > 700) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg); }

        doc.moveDown(0.6);
        doc.fillColor(STATUS_COLORS[statusKey]).font('Helvetica-Bold').fontSize(13)
          .text(`${groupLabel} (${group.length})`);
        doc.moveDown(0.3);

        for (const t of group) {
          // Each task gets a card
          if (doc.y > 680) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg); }

          const cardX = doc.x;
          const cardY = doc.y;
          const cardW = doc.page.width - 100;

          // Estimate card height based on content
          const hasDesc = !!t.description;
          const imgCount = (t.images || []).length;
          const docCount = (t.documents || []).length + (t.videos || []).length;
          const commCount = (t.comments || []).length;

          // Title row
          let titleH = 22;
          const titleLines = doc.heightOfString(t.title, { width: cardW - 130, font: 'Helvetica-Bold', size: 12 });
          titleH = Math.max(titleH, titleLines + 4);

          let cardH = titleH + 16; // title + meta
          if (hasDesc) {
            const descLines = doc.heightOfString(t.description, { width: cardW - 20, font: 'Helvetica', size: 9 });
            cardH += descLines + 12;
          }
          if (imgCount > 0) cardH += 140; // images row
          if (docCount > 0) cardH += 16;
          if (commCount > 0) cardH += 14 + (Math.min(commCount, 3) * 14);

          // Card background
          doc.save();
          doc.rect(cardX, cardY, cardW, cardH).fill(COLOR.card).stroke(COLOR.border);
          doc.restore();

          // Title
          doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(12).text(t.title, cardX + 10, cardY + 8, { width: cardW - 130 });

          // Status + Priority pills (right side)
          drawPill(doc, cardX + cardW - 115, cardY + 8, STATUS_LABELS[t.status] || t.status, STATUS_COLORS[t.status] || COLOR.muted);
          if (t.priority && t.priority !== 'media') {
            drawPill(doc, cardX + cardW - 60, cardY + 8, PRIORITY_LABELS[t.priority], PRIORITY_COLORS[t.priority]);
          }

          // Meta line
          let metaY = cardY + 8 + titleLines + 4;
          doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9);
          const metaBits = [];
          if (t.dueDate) metaBits.push(`📅 ${fmtDate(t.dueDate)}${new Date(t.dueDate) < now && t.status !== 'hecho' ? ' ⚠ vencida' : ''}`);
          if (t.owner?.name) metaBits.push(`👤 ${t.owner.name}`);
          if (t.assignee?.name) metaBits.push(`🎯 ${t.assignee.name}`);
          if (metaBits.length) doc.text(metaBits.join('   ·   '), cardX + 10, metaY);

          let cursorY = metaY + 14;

          // Description
          if (hasDesc) {
            const descH = doc.heightOfString(t.description, { width: cardW - 20, font: 'Helvetica', size: 9 });
            doc.fillColor(COLOR.text).font('Helvetica').fontSize(9).text(t.description, cardX + 10, cursorY, { width: cardW - 20 });
            cursorY += descH + 8;
          }

          // Images (try to embed; if it fails, fall back to filename list)
          if (imgCount > 0) {
            doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9).text(`📷 ${imgCount} imagen(es):`, cardX + 10, cursorY);
            cursorY += 12;

            const imagePromises = t.images.slice(0, 3).map(img => fetchImageBuffer(img.url));
            const imageBufs = await Promise.all(imagePromises);
            const slotW = (cardW - 40) / 3;
            for (let i = 0; i < imageBufs.length; i++) {
              const buf = imageBufs[i];
              const ix = cardX + 10 + i * (slotW + 10);
              const iy = cursorY;
              if (buf) {
                try {
                  doc.image(buf, ix, iy, { fit: [slotW, 90], align: 'center', valign: 'center' });
                } catch (_) {
                  doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
                  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text('(imagen no embedida)', ix, iy + 40, { width: slotW, align: 'center' });
                }
              } else {
                doc.rect(ix, iy, slotW, 90).fill(COLOR.bg).stroke(COLOR.border);
                doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(t.images[i].filename.slice(0, 18), ix, iy + 40, { width: slotW, align: 'center' });
              }
            }
            cursorY += 96;

            if (imgCount > 3) {
              doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
                .text(`... y ${imgCount - 3} imagen(es) más`, cardX + 10, cursorY);
              cursorY += 10;
            }
          }

          // Documents / videos
          if (docCount > 0) {
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9);
            const items = [
              ...(t.documents || []).map(d => `📄 ${d.filename}`),
              ...(t.videos || []).map(v => `🎬 ${v.filename}`),
            ];
            doc.text(items.slice(0, 4).join('   ·   '), cardX + 10, cursorY, { width: cardW - 20 });
            if (items.length > 4) doc.text(`... y ${items.length - 4} adjunto(s) más`);
            cursorY += 14;
          }

          // Comments
          if (commCount > 0) {
            doc.fillColor(COLOR.muted).font('Helvetica-Bold').fontSize(9).text(`💬 Comentarios (${commCount}):`, cardX + 10, cursorY);
            cursorY += 12;
            for (const c of (t.comments || []).slice(0, 3)) {
              const cText = `${c.author?.name || '?'}: ${c.text}`;
              const cH = doc.heightOfString(cText, { width: cardW - 30, font: 'Helvetica', size: 9 });
              doc.fillColor(COLOR.text).font('Helvetica').fontSize(9)
                .text(`• ${cText}`, cardX + 14, cursorY, { width: cardW - 30 });
              cursorY += cH + 2;
            }
          }

          doc.y = cardY + cardH + 8;
        }
      }
    }

    // === RECENT ACTIVITY ===
    if (allComments.length > 0) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg);
      drawSectionHead(doc, `💬 Actividad Reciente (${allComments.length})`);
      doc.moveDown(0.4);

      for (const c of allComments.slice(0, 30)) {
        if (doc.y > 720) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR.bg); }
        doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(10)
          .text(`${c.author?.name || '—'}  `, { continued: true });
        doc.font('Helvetica').fillColor(COLOR.muted).fontSize(9)
          .text(`comentó en "${c.taskTitle}" · ${new Date(c.createdAt).toLocaleString('es-MX')}`);
        doc.fillColor(COLOR.text).font('Helvetica').fontSize(10).text(c.text, { indent: 14 });
        doc.moveDown(0.5);
      }
    }

    // === FOOTER on every page ===
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8)
        .text(`Aguitech Core · Reporte generado el ${new Date().toLocaleString('es-MX')}`,
              50, doc.page.height - 30, { width: doc.page.width - 100, align: 'center' });
      doc.text(`Página ${i - range.start + 1} de ${range.count}`,
                50, doc.page.height - 18, { width: doc.page.width - 100, align: 'center' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
