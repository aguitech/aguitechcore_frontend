// API Key authentication middleware.
// Looks for `Authorization: Bearer agk_xxxxxxxxx` header.
// Looks up the key by prefix (cheap) and bcrypt-verifies the full value.
// Hydrates req.user just like requireAuth does, so downstream handlers
// can be shared between session and MCP contexts.
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';

export async function requireApiKey(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ message: 'API key requerida en Authorization: Bearer agk_...' });
    if (!token.startsWith('agk_')) {
      return res.status(401).json({ message: 'Formato de API key inválido. Debe iniciar con agk_' });
    }

    // We store prefix of length 12 (e.g. "agk_abc12345"). Use it to narrow the bcrypt search.
    const prefix = token.slice(0, 12);
    const candidate = await ApiKey.findOne({ prefix, enabled: true })
      .populate('user');
    if (!candidate) return res.status(401).json({ message: 'API key inválida o deshabilitada' });

    // Check expiry
    if (candidate.expiresAt && new Date(candidate.expiresAt) < new Date()) {
      return res.status(401).json({ message: 'API key expirada' });
    }

    // Verify the full token against the stored hash
    const ok = await candidate.verifyKey(token);
    if (!ok) return res.status(401).json({ message: 'API key inválida' });

    // Check the underlying user is still active
    if (!candidate.user || !candidate.user.active) {
      return res.status(401).json({ message: 'Usuario asociado deshabilitado' });
    }

    // Update lastUsedAt (fire-and-forget — don't block the request)
    ApiKey.updateOne({ _id: candidate._id }, { lastUsedAt: new Date() }).catch(() => {});

    req.user = candidate.user;
    req.apiKey = candidate;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Error al validar API key' });
  }
}
