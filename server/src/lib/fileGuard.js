// File guard: extension + MIME + magic-byte validation for generic uploads.
// Goal: block executables and macro-laden office docs while allowing source
// code (.js, .html, .ts, .py...), PDFs, images, video, audio, archives, etc.

import path from 'path';

// === Critical block list: never accept these extensions ===
// Executables, scripts, installers, macro-enabled office, Windows shortcuts.
const BLOCKED_EXTENSIONS = new Set([
  // Windows executables
  'exe', 'msi', 'dll', 'scr', 'pif', 'com', 'cpl', 'drv', 'sys',
  // Windows scripts
  'bat', 'cmd',
  // Scripts (server-side / shell)
  'sh', 'bash', 'zsh', 'ksh', 'csh', 'fish',
  // PowerShell
  'ps1', 'psm1', 'psd1', 'ps1xml',
  // Windows scripting
  'vbs', 'vbe', 'wsf', 'wsh', 'jse', 'vba',
  // HTML application (runs as app)
  'hta',
  // Shortcuts / registry
  'lnk', 'reg', 'inf', 'msc',
  // Java archives (can be malicious)
  'jar',
  // Office macros
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'sldm',
  // macOS scripts / apps (paranoia)
  'app', 'command', 'action',
]);

// === Allowed MIME prefixes (broad categories that are always safe) ===
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
];

// === Specific allowed MIME types (for application/* that isn't covered above) ===
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/json',
  'application/javascript', // .js files served with this MIME
  'application/xml',
  'application/xhtml+xml',  // .xhtml
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/octet-stream', // accepted but will be extra-strictly validated
  'application/msword',          // .doc (legacy)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-excel',                                                    // .xls (legacy)
  'application/vnd.ms-powerpoint',                                              // .ppt (legacy)
  'application/vnd.oasis.opendocument.text',                                    // .odt
  'application/vnd.oasis.opendocument.spreadsheet',                             // .ods
  'application/vnd.oasis.opendocument.presentation',                            // .odp
  'application/x-shockwave-flash',                                              // .swf (deprecated but harmless for download)
  'application/illustrator',                                                    // .ai
  'application/x-photoshop',                                                    // .psd
  'application/figma',                                                          // .fig
  'font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-otf',
  'application/font-woff', 'application/font-woff2',
  'application/x-font-woff', 'application/x-font-woff2',
  'application/wasm',
]);

// === Magic bytes for high-risk file types that must match their extension ===
// If a file claims to be a PDF but starts with MZ (exe) → reject.
const MAGIC_SIGNATURES = [
  { exts: ['pdf'],  bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { exts: ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'jar', 'apk'],
    bytes: [0x50, 0x4b, 0x03, 0x04] },                // PK\x03\x04
  { exts: ['7z'],   bytes: [0x37, 0x7a, 0xBC, 0xAF, 0x27, 0x1C] },
  { exts: ['rar'],  bytes: [0x52, 0x61, 0x72, 0x21, 0x1A] },
  { exts: ['gz'],   bytes: [0x1F, 0x8B] },
  { exts: ['png'],  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { exts: ['jpg', 'jpeg'], bytes: [0xFF, 0xD8, 0xFF] },
  { exts: ['gif'],  bytes: [0x47, 0x49, 0x46, 0x38] },
  { exts: ['webp'], bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...WEBP
  { exts: ['bmp'],  bytes: [0x42, 0x4D] },
  // Windows executables — used to detect masquerading files
  { exts: ['exe', 'msi', 'dll', 'scr', 'pif', 'com'],
    bytes: [0x4D, 0x5A] },                            // MZ
  { exts: ['elf'],  bytes: [0x7F, 0x45, 0x4C, 0x46] }, // ELF
];

function getExtension(filename) {
  // Strip query string and path just in case
  const base = path.basename(filename).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot === -1) return '';
  return base.slice(dot + 1);
}

export function validateFile({ originalname, mimetype, buffer }) {
  const errors = [];
  const ext = getExtension(originalname);

  // 1. No extension or empty extension → reject
  if (!ext) {
    return { ok: false, error: 'El archivo no tiene extensión' };
  }

  // 2. Check blocked list
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Tipo de archivo no permitido (.${ext}). Por seguridad, este formato está bloqueado.`,
    };
  }

  // 3. Check MIME type
  const mimeAllowed =
    ALLOWED_MIME_PREFIXES.some((p) => mimetype?.startsWith(p)) ||
    ALLOWED_MIME_EXACT.has(mimetype);

  if (!mimeAllowed) {
    errors.push(`MIME type no soportado (${mimetype})`);
  }

  // 4. Magic-byte validation (only for files we have signatures for)
  if (buffer && buffer.length > 0) {
    const sig = MAGIC_SIGNATURES.find((s) => s.exts.includes(ext));
    if (sig) {
      const matches = sig.bytes.every((b, i) => buffer[i] === b);
      if (!matches) {
        // Special case: if file claims .exe and IS MZ, that's already blocked by ext
        // If file claims .pdf/.png/.zip but bytes don't match → reject (masquerade)
        const isDisguisedExe = [0x4D, 0x5A].every((b, i) => buffer[i] === b);
        if (isDisguisedExe && ext !== 'exe') {
          errors.push(`El archivo .${ext} parece ser un ejecutable disfrazado`);
        } else {
          errors.push(`El contenido del archivo no coincide con la extensión .${ext}`);
        }
      }
    }
  }

  // 5. Filename sanity — block path traversal
  if (originalname.includes('..') || originalname.includes('/') || originalname.includes('\\')) {
    return { ok: false, error: 'Nombre de archivo inválido' };
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('. ') };
  }

  return { ok: true, ext };
}

// Categorize a file by its MIME / extension for UI grouping
export function categorizeFile(mimetype, filename) {
  const ext = getExtension(filename);
  if (mimetype?.startsWith('image/')) return 'image';
  if (mimetype?.startsWith('video/')) return 'video';
  if (mimetype?.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (
    mimetype?.startsWith('text/') ||
    ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'yml', 'yaml',
     'md', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'sh', 'sql',
     'txt', 'csv', 'env', 'ini', 'toml', 'lock'].includes(ext)
  ) return 'code';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return 'doc';
  if (['psd', 'ai', 'fig', 'sketch', 'xd'].includes(ext)) return 'design';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return 'other';
}

// Friendly size formatter
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
