import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import fs from 'fs';
import { validateFile, categorizeFile } from '../lib/fileGuard.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

// Helper: build a stable pair key for direct chats (sorted ids joined by ':')
function buildPairKey(userA, userB) {
  return [userA.toString(), userB.toString()].sort().join(':');
}

// Helper: serialize a conversation for the list panel
async function serializeConversation(conv, currentUserId) {
  // Look up the "other" participant for direct chats
  const other = conv.type === 'direct'
    ? conv.participants.find(p => p.user._id.toString() !== currentUserId.toString())?.user
      || conv.participants.find(p => p.user.toString() !== currentUserId.toString())?.user
    : null;

  // Count unread messages for the current user
  // (messages after the user's lastReadAt that were not sent by them)
  const me = conv.participants.find(p => {
    const id = p.user._id || p.user;
    return id.toString() === currentUserId.toString();
  });
  const lastReadAt = me?.lastReadAt || new Date(0);

  const unreadCount = await Message.countDocuments({
    conversation: conv._id,
    sender: { $ne: currentUserId },
    createdAt: { $gt: lastReadAt },
  });

  return {
    _id: conv._id,
    type: conv.type,
    name: conv.name || (other?.name || 'Chat'),
    other: other ? {
      _id: other._id,
      name: other.name,
      email: other.email,
      role: other.role,
    } : null,
    lastMessageAt: conv.lastMessageAt,
    lastMessageText: conv._lastMessageText || null, // populated below if needed
    unreadCount,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

// GET /api/chat/conversations
// List all conversations the current user participates in, ordered by most recent
export async function listConversations(req, res, next) {
  try {
    const convs = await Conversation.find({ 'participants.user': req.user._id })
      .populate('participants.user', 'name email role')
      .populate({ path: 'lastMessage', select: 'text sender createdAt attachments' })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    // Attach lastMessageText
    const out = await Promise.all(convs.map(async (c) => {
      const me = c.participants.find(p => {
        const id = p.user._id || p.user;
        return id.toString() === req.user._id.toString();
      });
      const lastReadAt = me?.lastReadAt || new Date(0);
      const unreadCount = await Message.countDocuments({
        conversation: c._id,
        sender: { $ne: req.user._id },
        createdAt: { $gt: lastReadAt },
      });
      return {
        _id: c._id,
        type: c.type,
        name: c.name || (c.participants.find(p => {
          const id = p.user._id || p.user;
          return id.toString() !== req.user._id.toString();
        })?.user?.name) || 'Chat',
        other: c.type === 'direct' ? (() => {
          const o = c.participants.find(p => {
            const id = p.user._id || p.user;
            return id.toString() !== req.user._id.toString();
          });
          return o?.user ? { _id: o.user._id, name: o.user.name, email: o.user.email, role: o.user.role } : null;
        })() : null,
        lastMessageAt: c.lastMessageAt,
        lastMessage: c.lastMessage || null,
        unreadCount,
        createdAt: c.createdAt,
      };
    }));

    res.json(out);
  } catch (err) { next(err); }
}

// POST /api/chat/conversations
// Body: { email } — find user by email and create/get the 1-on-1 conversation
export async function openConversation(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });

    const other = await User.findOne({ email: email.toLowerCase().trim() });
    if (!other) return res.status(404).json({ message: `No existe un usuario con email ${email}` });
    if (other._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'No puedes chatear contigo mismo' });
    }

    const pairKey = buildPairKey(req.user._id, other._id);
    let conv = await Conversation.findOne({ pairKey });
    if (!conv) {
      conv = await Conversation.create({
        type: 'direct',
        pairKey,
        participants: [{ user: req.user._id }, { user: other._id }],
        lastMessageAt: new Date(),
      });
    }
    conv = await Conversation.findById(conv._id)
      .populate('participants.user', 'name email role')
      .lean();

    res.json(await serializeConversation(conv, req.user._id));
  } catch (err) { next(err); }
}

// GET /api/chat/conversations/:id/messages?cursor=<id>&limit=30
// Cursor-based pagination: returns messages OLDER than `cursor`, newest first
// First call (no cursor) returns the most recent N messages
export async function listMessages(req, res, next) {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const cursor = req.query.cursor; // message _id (for pagination: messages before this)
    const since = req.query.since;   // ISO timestamp (for polling: messages after this)

    // Verify user is a participant
    const conv = await Conversation.findOne({
      _id: id,
      'participants.user': req.user._id,
    }).lean();
    if (!conv) return res.status(404).json({ message: 'Conversación no encontrada' });

    const filter = { conversation: id };
    if (cursor) {
      filter._id = { $lt: cursor };
    }
    if (since) {
      // Polling mode: fetch only messages newer than `since`
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        filter.createdAt = { $gt: sinceDate };
      }
    }
    const messages = await Message.find(filter)
      .populate('sender', 'name email role')
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    const hasMore = messages.length === limit && !since;
    const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

    res.json({
      messages: messages.reverse(), // Send in chronological order for the UI
      hasMore,
      nextCursor,
    });
  } catch (err) { next(err); }
}

// POST /api/chat/conversations/:id/messages
// Body: { text }   OR   multipart/form-data with "files" + optional "text"
// When files are sent, attachments are added to the message.
export async function sendMessage(req, res, next) {
  try {
    const { id } = req.params;
    // text may come from JSON body OR multipart form-data field.
    // multer populates req.body for multipart form fields too, so this works for both.
    const text = (req.body?.text ?? '').toString();
    const files = req.files || [];

    const conv = await Conversation.findOne({
      _id: id,
      'participants.user': req.user._id,
    });
    if (!conv) return res.status(404).json({ message: 'Conversación no encontrada' });

    if (!text.trim() && files.length === 0) {
      return res.status(400).json({ message: 'Mensaje vacío' });
    }

    // Build attachments array from uploaded files
    const attachments = files.map((f) => {
      const kind = categorizeFile(f.mimetype, f.originalname); // 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'code' | 'doc' | 'design' | 'font' | 'other'
      // Normalize to one of our three buckets
      let normalized = 'document';
      if (kind === 'image') normalized = 'image';
      else if (kind === 'video') normalized = 'video';
      else normalized = 'document';
      return {
        kind: normalized,
        url: `/api/uploads/${f.filename}`,
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      };
    });

    const msg = await Message.create({
      conversation: id,
      sender: req.user._id,
      text: text.trim(),
      attachments,
    });

    // Update conversation's last message pointer
    conv.lastMessage = msg._id;
    conv.lastMessageAt = msg.createdAt;
    await conv.save();

    const populated = await Message.findById(msg._id)
      .populate('sender', 'name email role')
      .lean();

    // Notify every other participant — they should see a bell update.
    // For direct chats this is just the other person; for groups it's everyone else.
    const recipients = (conv.participants || [])
      .map((p) => (p.user?._id || p.user)?.toString())
      .filter((uid) => uid && uid !== req.user._id.toString());
    const preview = (text.trim() || (attachments.length ? `📎 ${attachments.length} adjunto(s)` : '')).slice(0, 200);
    for (const uid of recipients) {
      notify({
        recipient: uid,
        type: 'chat.message',
        title: `💬 ${req.user.name}`,
        body: preview,
        link: `/chat?conv=${id}`,
        sourceType: 'Conversation',
        sourceId: String(id),
        actor: req.user._id,
        actorName: req.user.name,
        meta: { messageId: String(msg._id), hasAttachments: attachments.length > 0 },
      });
    }

    // Audit
    audit({
      req,
      action: 'chat.message',
      category: 'chat',
      targetType: 'Conversation',
      targetId: id,
      targetLabel: conv.title || `Chat con ${recipients.length} participante(s)`,
      meta: { messageId: String(msg._id), recipients: recipients.length, hasAttachments: attachments.length > 0 },
    });

    res.status(201).json(populated);
  } catch (err) { next(err); }
}

// POST /api/chat/conversations/:id/read
// Mark all messages in this conversation as read by the current user
export async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const conv = await Conversation.findOne({
      _id: id,
      'participants.user': req.user._id,
    });
    if (!conv) return res.status(404).json({ message: 'Conversación no encontrada' });

    const me = conv.participants.find(p => p.user.toString() === req.user._id.toString());
    if (me) {
      me.lastReadAt = new Date();
      await conv.save();
    }

    // Add current user to readBy of all messages not from them
    await Message.updateMany(
      { conversation: id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /api/chat/users/search?email=...
// Quick search for starting a new chat
export async function searchUsers(req, res, next) {
  try {
    const q = (req.query.q || req.query.email || '').toString().toLowerCase().trim();
    if (!q) return res.json([]);
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
    })
      .select('name email role')
      .limit(10)
      .lean();
    res.json(users);
  } catch (err) { next(err); }
}

// === Attachment upload endpoint ===
// Multipart endpoint to attach files to the LAST message sent by the user
// in the conversation (or create a new message if no text is needed).
// Body: files (multipart, field "files")
export async function uploadAttachments(req, res, next) {
  try {
    const { id } = req.params;
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'Sin archivos' });
    }

    const conv = await Conversation.findOne({
      _id: id,
      'participants.user': req.user._id,
    });
    if (!conv) return res.status(404).json({ message: 'Conversación no encontrada' });

    // Validate each file (extension + magic bytes). Documents go through fileGuard.
    const accepted = [];
    const rejected = [];
    for (const f of files) {
      // For images/videos the multer filter already validated mimetype prefix.
      // For "other" types (PDFs, archives, code) we re-validate with fileGuard.
      const cat = categorizeFile(f.mimetype, f.originalname);
      if (!['image', 'video'].includes(cat)) {
        const check = validateFile({
          originalname: f.originalname,
          mimetype: f.mimetype,
          buffer: f.buffer,
        });
        if (!check.ok) {
          if (f.path) fs.unlink(f.path, () => {});
          rejected.push({ filename: f.originalname, error: check.error });
          continue;
        }
      }
      accepted.push(f);
    }

    if (accepted.length === 0) {
      return res.status(400).json({
        message: 'Ningún archivo pasó la validación',
        rejected,
      });
    }

    const attachments = accepted.map((f) => {
      const cat = categorizeFile(f.mimetype, f.originalname);
      let normalized = 'document';
      if (cat === 'image') normalized = 'image';
      else if (cat === 'video') normalized = 'video';
      else normalized = 'document';
      return {
        kind: normalized,
        url: `/api/uploads/${f.filename}`,
        filename: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      };
    });

    // Create a new "attachment-only" message
    const msg = await Message.create({
      conversation: id,
      sender: req.user._id,
      text: '',
      attachments,
    });

    conv.lastMessage = msg._id;
    conv.lastMessageAt = msg.createdAt;
    await conv.save();

    const populated = await Message.findById(msg._id)
      .populate('sender', 'name email role')
      .lean();

    res.status(201).json({ message: populated, rejected });
  } catch (err) { next(err); }
}
