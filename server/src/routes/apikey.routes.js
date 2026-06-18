// API Key CRUD — manage the user's own keys.
// Mounted at /api/profile/apikeys so it's a sub-resource of the user's profile.
// All endpoints require a JWT session (not API key) so the user can manage keys
// from the Profile page.
import { Router } from 'express';
import ApiKey from '../models/ApiKey.js';
import { requireAuth } from '../middleware/auth.js';
import { generateApiKey } from '../lib/apiKeyGen.js';

const router = Router();
router.use(requireAuth);

// GET /api/profile/apikeys — list current user's keys (without secrets)
router.get('/', async (req, res, next) => {
  try {
    const keys = await ApiKey.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    const out = keys.map((k) => ({
      _id: k._id,
      name: k.name,
      prefix: k.prefix,
      suffix: k.suffix,
      enabled: k.enabled,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }));
    res.json(out);
  } catch (err) { next(err); }
});

// POST /api/profile/apikeys — create a new key.
// Returns the plaintext ONCE in `plaintext`. Never again.
router.post('/', async (req, res, next) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'El nombre es obligatorio' });
    if (name.length > 80) return res.status(400).json({ message: 'El nombre es demasiado largo (máx 80)' });

    const { plaintext, prefix, suffix } = generateApiKey();

    const created = await ApiKey.create({
      user: req.user._id,
      name,
      prefix,
      suffix,
      // Store the FULL plaintext; the pre-save hook will bcrypt-hash it.
      hashedKey: plaintext,
    });

    res.status(201).json({
      _id: created._id,
      name: created.name,
      prefix: created.prefix,
      suffix: created.suffix,
      enabled: created.enabled,
      createdAt: created.createdAt,
      // PLAINTEXT — shown ONCE. Caller must display and store it now.
      plaintext,
      // A friendly hint for the user
      hint: 'Guarda este token ahora. No se volverá a mostrar.',
    });
  } catch (err) { next(err); }
});

// PATCH /api/profile/apikeys/:id — enable/disable (or rename).
router.patch('/:id', async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body?.enabled === 'boolean') update.enabled = req.body.enabled;
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      update.name = req.body.name.trim().slice(0, 80);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Nada que actualizar' });
    }
    const key = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update,
      { new: true }
    ).lean();
    if (!key) return res.status(404).json({ message: 'API key no encontrada' });
    res.json({
      _id: key._id,
      name: key.name,
      prefix: key.prefix,
      suffix: key.suffix,
      enabled: key.enabled,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    });
  } catch (err) { next(err); }
});

// DELETE /api/profile/apikeys/:id — revoke permanently.
router.delete('/:id', async (req, res, next) => {
  try {
    const out = await ApiKey.deleteOne({ _id: req.params.id, user: req.user._id });
    if (out.deletedCount === 0) return res.status(404).json({ message: 'API key no encontrada' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
