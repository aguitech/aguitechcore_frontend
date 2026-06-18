// HTTP wrapper around the shared PDF generator.
// Streams the report directly to the response.
import PDFDocument from 'pdfkit';
import { loadProjectReportData, renderProjectReportPdf } from '../lib/pdfReport.js';
import { MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP, MARGIN_BOTTOM } from '../lib/pdfReport.js';

export async function exportProjectPdf(req, res, next) {
  try {
    const data = await loadProjectReportData(req.params.id, req.user._id);
    if (!data) return res.status(404).json({ message: 'Proyecto no encontrado' });

    // Build a public base URL from the request so attachment links in the
    // PDF resolve to absolute https URLs (Traefik terminates TLS for us).
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const publicBaseUrl = host ? `${proto}://${host}` : '';

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

    res.setHeader('Content-Type', 'application/pdf');
    const safeName = data.project.title.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="proyecto_${safeName}.pdf"`);
    doc.pipe(res);

    await renderProjectReportPdf(doc, data, req.user, publicBaseUrl);
    doc.end();
  } catch (err) {
    next(err);
  }
}
