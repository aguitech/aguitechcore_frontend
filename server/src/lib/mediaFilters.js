// Centralized multer file filters for image and video uploads.
//
// Why this exists:
// iOS Safari, Android Chrome, and some desktop browsers send the file with
// `mimetype: "application/octet-stream"` when the OS / browser can't figure
// out the real type — most commonly:
//   • HEIC / HEIF photos taken with an iPhone camera
//   • Camera roll selections on Android that have been re-encoded
//   • Files dragged from a chat / cloud folder with no extension
//
// The previous filters only checked `file.mimetype.startsWith('image/')`
// (or 'video/') and rejected everything else with a 500, which is what the
// user saw as "Error subiendo la imagen" on their phone.
//
// These filters accept a file if ANY of the following is true:
//   1. Its MIME type is a real image / video MIME
//   2. Its MIME type is octet-stream / empty AND the extension is known
//   3. The extension is known even if neither MIME nor magic bytes match
//
// Final safety net: a server-side magic-byte sniff happens in the
// fileGuard layer for documents. For images/videos we keep the
// permission generous at the multer level (don't lose the user's photo)
// and rely on the upload size limit + the fact that the bytes are
// served back as `image/*` URLs anyway.

const IMAGE_EXTS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
  'heic', 'heif', 'avif', 'tif', 'tiff', 'ico', 'apng',
];

const VIDEO_EXTS = [
  'mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv',
  '3gp', '3gpp', 'ogv', 'ogg', 'ts', 'mts', 'm2ts',
];

function extOf(name = '') {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function makeImageFilter() {
  return (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = extOf(file.originalname);

    if (/^image\//.test(mime)) return cb(null, true);
    if (mime === 'application/octet-stream' || mime === '' || mime === 'binary/octet-stream') {
      if (IMAGE_EXTS.includes(ext)) return cb(null, true);
    }
    if (ext && IMAGE_EXTS.includes(ext)) return cb(null, true);

    return cb(new Error(
      `Solo se permiten imágenes (jpg, png, gif, webp, heic, avif). ` +
      `Recibido: mimetype="${mime || 'vacío'}", archivo="${file.originalname}"`
    ));
  };
}

export function makeVideoFilter() {
  return (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = extOf(file.originalname);

    if (/^video\//.test(mime)) return cb(null, true);
    if (mime === 'application/octet-stream' || mime === '' || mime === 'binary/octet-stream') {
      if (VIDEO_EXTS.includes(ext)) return cb(null, true);
    }
    if (ext && VIDEO_EXTS.includes(ext)) return cb(null, true);

    return cb(new Error(
      `Solo se permiten videos (mp4, webm, mov, m4v). ` +
      `Recibido: mimetype="${mime || 'vacío'}", archivo="${file.originalname}"`
    ));
  };
}

// Permissive filter for generic documents — the controller runs
// fileGuard for real validation. Kept here for symmetry / one-stop import.
export function makeDocumentFilter() {
  return (_req, _file, cb) => cb(null, true);
}

export { IMAGE_EXTS, VIDEO_EXTS };
