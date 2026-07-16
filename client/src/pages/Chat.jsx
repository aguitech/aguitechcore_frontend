import { useEffect, useState, useRef, useCallback } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Format a timestamp as a short relative string ("hace 5 min", "ayer", "12/06/26")
function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
}

function formatMessageTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// Normalize a sender reference to its string id.
function getSenderId(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  if (typeof sender === 'object') {
    if (sender._id && typeof sender._id === 'object' && sender._id.toString) {
      return sender._id.toString();
    }
    if (sender._id) return String(sender._id);
    if (sender.toString && sender.toString !== Object.prototype.toString) {
      return sender.toString();
    }
  }
  return '';
}

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function fileIcon(filename) {
  const ext = (filename?.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼️';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return '🎵';
  if (ext === 'pdf') return '📕';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  if (['doc', 'docx', 'odt'].includes(ext)) return '📃';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'md', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'sh', 'sql', 'txt'].includes(ext)) return '📄';
  return '📎';
}

const PAGE_SIZE = 20;

// Render the attachments array of a single message as JSX
function MessageAttachments({ attachments, isMine }) {
  if (!attachments || attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const videos = attachments.filter((a) => a.kind === 'video');
  const docs = attachments.filter((a) => a.kind === 'document');

  return (
    <div className="msg-attachments" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {images.length > 0 && (
        <div className="msg-image-grid" style={{
          display: 'grid',
          gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          gap: 4,
          maxWidth: 320,
        }}>
          {images.map((img, i) => (
            <a
              key={i}
              href={img.url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ display: 'block', borderRadius: 6, overflow: 'hidden', background: '#000' }}
            >
              <img
                src={img.url}
                alt={img.filename}
                style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
              />
            </a>
          ))}
        </div>
      )}
      {videos.map((v, i) => (
        <video
          key={i}
          src={v.url}
          controls
          preload="metadata"
          style={{ maxWidth: 320, maxHeight: 280, borderRadius: 6, display: 'block' }}
        />
      ))}
      {docs.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {docs.map((d, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: isMine ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                borderRadius: 6,
                minWidth: 200,
                maxWidth: 340,
              }}
            >
              <span style={{ fontSize: '1.4em' }}>{fileIcon(d.filename)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={d.filename}
                >
                  {d.filename}
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.75 }}>{fmtSize(d.size)}</div>
              </div>
              <a
                href={d.url}
                download={d.filename}
                target="_blank"
                rel="noreferrer noopener"
                title="Descargar"
                style={{ color: 'inherit', textDecoration: 'none', fontSize: '1.1em' }}
              >
                ⬇
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// File-chip showing a file staged before sending
function StagedFileChip({ file, onRemove }) {
  const isImage = file.type?.startsWith('image/');
  const isVideo = file.type?.startsWith('video/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  // Free the object URL when this chip unmounts
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--bg-2, #181818)',
        border: '1px solid var(--border, #2a2a2a)',
        borderRadius: 8,
        padding: 4,
        minWidth: 70,
        maxWidth: 110,
        overflow: 'hidden',
      }}
    >
      {isImage ? (
        <img src={previewUrl} alt={file.name} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 4 }} />
      ) : isVideo ? (
        <div style={{ width: '100%', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8em' }}>🎬</div>
      ) : (
        <div style={{ width: '100%', height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '1.6em', padding: 4 }}>
          <span>{fileIcon(file.name)}</span>
          <span style={{ fontSize: '0.7em', color: 'var(--muted)', marginTop: 2, textAlign: 'center', wordBreak: 'break-all' }}>
            {(file.name.split('.').pop() || '').toUpperCase()}
          </span>
        </div>
      )}
      <div
        style={{
          fontSize: '0.7em',
          color: 'var(--muted)',
          marginTop: 2,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={file.name}
      >
        {file.name}
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Quitar"
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 18,
          height: 18,
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function Chat() {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState('');

  // Attachments staged for the next message
  const [stagedFiles, setStagedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const previousScrollHeight = useRef(0);

  // ============== Load conversations ==============
  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setConversations(data);
    } catch (err) {
      console.error('loadConvs', err);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ============== Load messages for active conversation ==============
  const loadMessages = useCallback(async (convId, cursor = null) => {
    if (!convId) return;
    const isFirstPage = !cursor;
    if (isFirstPage) setLoadingMsgs(true); else setLoadingMore(true);
    try {
      const params = { limit: PAGE_SIZE };
      if (cursor) params.cursor = cursor;
      const { data } = await api.get(`/chat/conversations/${convId}/messages`, { params });
      if (isFirstPage) {
        setMessages(data.messages);
      } else {
        // Prepend older messages
        setMessages(prev => [...data.messages, ...prev]);
      }
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('loadMessages', err);
    } finally {
      setLoadingMsgs(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) {
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      setStagedFiles([]);
      loadMessages(activeId, null);
      // Mark as read
      api.post(`/chat/conversations/${activeId}/read`).catch(() => {});
      // Focus the input immediately when opening a conversation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeId, loadMessages]);

  // ============== Polling: detect new messages in real time ==============
  const lastMessageTimestampRef = useRef(null);
  useEffect(() => { lastMessageTimestampRef.current = null; }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const convRes = await api.get('/chat/conversations');
        if (cancelled) return;
        setConversations(convRes.data);
        const since = lastMessageTimestampRef.current;
        const params = { limit: 50, since: since || '' };
        const { data } = await api.get(`/chat/conversations/${activeId}/messages`, { params });
        if (cancelled) return;
        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => String(m._id)));
            const fresh = data.messages.filter((m) => !known.has(String(m._id)));
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
          const latest = data.messages[data.messages.length - 1];
          if (latest?.createdAt) lastMessageTimestampRef.current = latest.createdAt;
        }
      } catch (err) {
        console.warn('poll tick failed', err.message);
      }
    };
    const interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest?.createdAt) lastMessageTimestampRef.current = latest.createdAt;
    }
  }, [messages]);

  // ============== Auto-scroll to bottom on new messages ==============
  const isFirstLoadRef = useRef(true);
  useEffect(() => { isFirstLoadRef.current = true; }, [activeId]);
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      const c = messagesContainerRef.current;
      if (!c) return;
      if (isFirstLoadRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        isFirstLoadRef.current = false;
      } else {
        const isNearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 200;
        if (isNearBottom) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    if (loadingMore === false && previousScrollHeight.current && messagesContainerRef.current) {
      const c = messagesContainerRef.current;
      const newScrollHeight = c.scrollHeight;
      c.scrollTop = newScrollHeight - previousScrollHeight.current;
      previousScrollHeight.current = 0;
    }
  }, [messages, loadingMore]);

  // ============== Scroll handler: load more on top ==============
  const handleScroll = useCallback((e) => {
    const c = e.target;
    if (c.scrollTop === 0 && hasMore && !loadingMore && nextCursor) {
      previousScrollHeight.current = c.scrollHeight;
      loadMessages(activeId, nextCursor);
    }
  }, [hasMore, loadingMore, nextCursor, activeId, loadMessages]);

  // ============== Staging attachments ==============
  function addFilesToStage(fileList) {
    if (!fileList || fileList.length === 0) return;
    // Max 20 files per message (server limit). 50 MB per file.
    setStagedFiles((prev) => {
      const next = [...prev];
      for (const f of fileList) {
        if (next.length >= 20) break;
        if (f.size > 50 * 1024 * 1024) {
          setError(`"${f.name}" excede 50 MB`);
          setTimeout(() => setError(''), 3500);
          continue;
        }
        next.push(f);
      }
      return next;
    });
  }

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    addFilesToStage(files);
    e.target.value = '';
  }

  function onDropFiles(e) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    addFilesToStage(files);
  }

  function removeStaged(idx) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearStaged() {
    setStagedFiles([]);
  }

  // ============== Send a message ==============
  async function sendMessage(e) {
    e?.preventDefault();
    if ((!text.trim() && stagedFiles.length === 0) || !activeId || sending) return;
    setSending(true);
    setError('');
    try {
      let res;
      if (stagedFiles.length > 0) {
        // Multipart: text + files
        const fd = new FormData();
        if (text.trim()) fd.append('text', text.trim());
        for (const f of stagedFiles) fd.append('files', f);
        // IMPORTANT: do NOT set Content-Type manually here. Axios sets the
        // correct `multipart/form-data; boundary=...` automatically when the body
        // is a FormData instance. Forcing it without the boundary makes the
        // backend multer unable to parse the parts. Just send the FormData as-is.
        res = await api.post(`/chat/conversations/${activeId}/messages`, fd);
      } else {
        res = await api.post(`/chat/conversations/${activeId}/messages`, { text });
      }
      setMessages(prev => [...prev, res.data]);
      setText('');
      clearStaged();
      await loadConversations();
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al enviar');
    } finally {
      setSending(false);
    }
  }

  // ============== Start new chat ==============
  async function searchUser(q) {
    setNewChatEmail(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const { data } = await api.get('/chat/users/search', { params: { q } });
      setSearchResults(data);
    } catch (err) { console.error(err); }
  }

  async function startChatWith(email) {
    try {
      const { data: conv } = await api.post('/chat/conversations', { email });
      setShowNewChat(false);
      setNewChatEmail('');
      setSearchResults([]);
      await loadConversations();
      setActiveId(conv._id);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo abrir la conversación');
      setTimeout(() => setError(''), 4000);
    }
  }

  // ============== Helpers for rendering ==============
  const activeConv = conversations.find(c => c._id === activeId);
  const activeOther = activeConv?.other;
  const canSend = (text.trim() || stagedFiles.length > 0) && !sending;

  return (
    <Layout>
      <div className={`chat-page ${activeId ? 'has-active' : ''}`}>
        {/* ============ LEFT PANEL ============ */}
        <aside className="chat-sidebar">
          <header className="chat-sidebar-head">
            <div>
              <h2>💬 Chats</h2>
              <p className="muted small">{conversations.length} conversaciones</p>
            </div>
            <button
              className="primary small"
              onClick={() => setShowNewChat(s => !s)}
              title="Iniciar nuevo chat"
            >
              ✏️ Nuevo
            </button>
          </header>

          {showNewChat && (
            <div className="new-chat-box">
              <p className="muted small">Escribe el email o nombre de un usuario:</p>
              <input
                type="text"
                placeholder="memo@codimexa.com"
                value={newChatEmail}
                onChange={(e) => searchUser(e.target.value)}
                autoFocus
              />
              {searchResults.length > 0 && (
                <ul className="user-search-results">
                  {searchResults.map(u => (
                    <li key={u._id} onClick={() => startChatWith(u.email)}>
                      <div className="avatar-sm">{u.name?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <strong>{u.name}</strong>
                        <div className="muted small">{u.email}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <div className="alert">{error}</div>}

          <div className="chat-conversation-list">
            {loadingConvs ? (
              <p className="muted center" style={{ padding: '2rem' }}>Cargando chats...</p>
            ) : conversations.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>📭 Sin conversaciones aún</p>
                <p className="muted small">Toca "✏️ Nuevo" para empezar un chat con alguien.</p>
              </div>
            ) : (
              conversations.map(c => (
                <div
                  key={c._id}
                  className={`conv-item ${c._id === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(c._id)}
                >
                  <div className="avatar-md">
                    {(c.other?.name?.[0] || c.name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="conv-info">
                    <div className="conv-row1">
                      <strong>{c.other?.name || c.name || 'Chat'}</strong>
                      <span className="muted small">
                        {formatRelativeTime(c.lastMessageAt || c.updatedAt)}
                      </span>
                    </div>
                    <div className="conv-row2">
                      <span className="conv-preview">
                        {c.lastMessage?.text || (c.lastMessage?.attachments?.length ? `📎 ${c.lastMessage.attachments.length} adjunto(s)` : (c.lastMessage ? '' : 'Sin mensajes aún'))}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="badge">{c.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ============ RIGHT PANEL: Active chat ============ */}
        <main className="chat-main">
          {!activeId ? (
            <div className="chat-empty">
              <h2>💬 Selecciona un chat</h2>
              <p className="muted">O inicia uno nuevo con "✏️ Nuevo" usando el email de un usuario.</p>
            </div>
          ) : (
            <>
              <header className="chat-header">
                <button
                  type="button"
                  className="chat-back-btn ghost small"
                  onClick={() => setActiveId(null)}
                  aria-label="Volver a chats"
                  title="Volver"
                >
                  ←
                </button>
                {activeOther && (
                  <>
                    <div className="avatar-md">
                      {(activeOther.name?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <strong>{activeOther.name}</strong>
                      <div className="muted small">{activeOther.email}</div>
                    </div>
                  </>
                )}
              </header>

              <div
                className={`chat-messages ${dragOver ? 'drag-over' : ''}`}
                ref={messagesContainerRef}
                onScroll={handleScroll}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFiles}
              >
                {dragOver && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(255,106,0,0.10)',
                      border: '2px dashed #FF6A00',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FF6A00',
                      fontWeight: 600,
                      fontSize: '1.1em',
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                  >
                    Suelta aquí para adjuntar
                  </div>
                )}

                {loadingMsgs ? (
                  <p className="muted center" style={{ padding: '2rem' }}>Cargando mensajes...</p>
                ) : messages.length === 0 ? (
                  <div className="empty-state" style={{ padding: '3rem' }}>
                    <p>👋 Esta conversación está vacía</p>
                    <p className="muted small">Envía el primer mensaje abajo.</p>
                  </div>
                ) : (
                  <>
                    {loadingMore && (
                      <p className="muted small center" style={{ padding: '0.5rem' }}>
                        Cargando mensajes anteriores...
                      </p>
                    )}
                    <div ref={messagesTopRef} />
                    {messages.map((m, i) => {
                      const senderId = getSenderId(m.sender);
                      const myId = getSenderId(currentUser);
                      const isMine = senderId && myId && senderId === myId;
                      const prev = messages[i - 1];
                      const showAvatar = !isMine && (!prev || getSenderId(prev.sender) !== senderId);
                      const hasAttachments = m.attachments && m.attachments.length > 0;
                      return (
                        <div
                          key={m._id}
                          className={`msg-bubble ${isMine ? 'mine' : 'theirs'} ${showAvatar ? 'with-avatar' : ''}`}
                        >
                          {!isMine && showAvatar && (
                            <div className="avatar-xs">{m.sender.name?.[0]?.toUpperCase()}</div>
                          )}
                          <div className="msg-content">
                            {m.text && <div className="msg-text">{m.text}</div>}
                            {hasAttachments && <MessageAttachments attachments={m.attachments} isMine={isMine} />}
                            <div className="msg-time">{formatMessageTime(m.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {stagedFiles.length > 0 && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-2, #181818)',
                    borderTop: '1px solid var(--border, #2a2a2a)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                    maxHeight: 140,
                    overflowY: 'auto',
                  }}
                >
                  <span style={{ fontSize: '0.8em', color: 'var(--muted)', marginRight: 4 }}>
                    Adjuntos ({stagedFiles.length}):
                  </span>
                  {stagedFiles.map((f, i) => (
                    <StagedFileChip key={i} file={f} onRemove={() => removeStaged(i)} />
                  ))}
                  <button
                    type="button"
                    onClick={clearStaged}
                    className="ghost small"
                    style={{ marginLeft: 'auto' }}
                  >
                    Quitar todos
                  </button>
                </div>
              )}

              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); onPickFiles(e); }}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  title="Adjuntar foto, video o archivo"
                  disabled={sending}
                  style={{ fontSize: '1.2em', padding: '6px 10px' }}
                >
                  📎
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={stagedFiles.length > 0 ? 'Añade un texto (opcional) y envía…' : 'Escribe un mensaje...'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={sending}
                  autoFocus
                />
                <button
                  type="submit"
                  className="primary"
                  disabled={!canSend}
                >
                  {sending ? '...' : '➤'}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </Layout>
  );
}
