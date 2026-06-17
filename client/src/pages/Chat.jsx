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
// `sender` can come back from the API as:
//   - a populated object:  { _id: 'abc', name, email, role }
//   - a plain string id:   'abc'
//   - an ObjectId-shaped object: { _id: ObjectId('abc'), ... }
// We always coerce to string so the equality check is reliable.
function getSenderId(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  if (typeof sender === 'object') {
    // ObjectId has toString() that returns the hex id
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

const PAGE_SIZE = 20;

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

  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
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
      loadMessages(activeId, null);
      // Mark as read
      api.post(`/chat/conversations/${activeId}/read`).catch(() => {});
      // Focus the input immediately when opening a conversation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeId, loadMessages]);

  // ============== Polling: detect new messages in real time ==============
  // Every 4 seconds, check if the active conversation has new messages.
  // If yes, fetch only the new ones (after the last known message timestamp)
  // and append to the list. Also refresh conversation list for unread badges.
  const lastMessageTimestampRef = useRef(null);
  useEffect(() => { lastMessageTimestampRef.current = null; }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        // 1) Refresh conversation list (so unread badges update)
        const convRes = await api.get('/chat/conversations');
        if (cancelled) return;
        setConversations(convRes.data);
        // 2) Fetch only messages after the last known timestamp
        const since = lastMessageTimestampRef.current;
        const params = { limit: 50, since: since || '' };
        const { data } = await api.get(`/chat/conversations/${activeId}/messages`, { params });
        if (cancelled) return;
        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            // Dedupe by _id in case some were already loaded
            const known = new Set(prev.map((m) => String(m._id)));
            const fresh = data.messages.filter((m) => !known.has(String(m._id)));
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
          // Update the timestamp cursor to the latest message
          const latest = data.messages[data.messages.length - 1];
          if (latest?.createdAt) lastMessageTimestampRef.current = latest.createdAt;
        }
      } catch (err) {
        // Silent: polling failures shouldn't bother the user
        console.warn('poll tick failed', err.message);
      }
    };
    // Run every 4 seconds
    const interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  // Update the timestamp cursor whenever messages change (covers local sends)
  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest?.createdAt) lastMessageTimestampRef.current = latest.createdAt;
    }
  }, [messages]);

  // ============== Auto-scroll to bottom on new messages ==============
  // When the conversation first opens (after messages are loaded), force-scroll to the
  // very bottom so the user sees the latest message right away. For subsequent updates,
  // only auto-scroll if the user is already near the bottom (don't yank them away from
  // older messages they're reading).
  const isFirstLoadRef = useRef(true);
  useEffect(() => { isFirstLoadRef.current = true; }, [activeId]);
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      const c = messagesContainerRef.current;
      if (!c) return;
      if (isFirstLoadRef.current) {
        // Force scroll to bottom on first load of a conversation
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        isFirstLoadRef.current = false;
      } else {
        // Only auto-scroll when user is near bottom (within 200px)
        const isNearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 200;
        if (isNearBottom) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [messages]);

  // After loading older messages, restore scroll position
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

  // ============== Send a message ==============
  async function sendMessage(e) {
    e?.preventDefault();
    if (!text.trim() || !activeId || sending) return;
    setSending(true);
    try {
      const { data: msg } = await api.post(`/chat/conversations/${activeId}/messages`, { text });
      setMessages(prev => [...prev, msg]);
      setText('');
      // Update conversation list (move to top + new preview)
      await loadConversations();
      // Auto-scroll
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

  return (
    <Layout>
      <div className={`chat-page ${activeId ? 'has-active' : ''}`}>
        {/* ============ LEFT PANEL: Conversations list ============ */}
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
                        {c.lastMessage?.text || (c.lastMessage ? '' : 'Sin mensajes aún')}
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
                className="chat-messages"
                ref={messagesContainerRef}
                onScroll={handleScroll}
              >
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
                      return (
                        <div
                          key={m._id}
                          className={`msg-bubble ${isMine ? 'mine' : 'theirs'} ${showAvatar ? 'with-avatar' : ''}`}
                        >
                          {!isMine && showAvatar && (
                            <div className="avatar-xs">{m.sender.name?.[0]?.toUpperCase()}</div>
                          )}
                          <div className="msg-content">
                            <div className="msg-text">{m.text}</div>
                            <div className="msg-time">{formatMessageTime(m.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={sending}
                  autoFocus
                />
                <button
                  type="submit"
                  className="primary"
                  disabled={!text.trim() || sending}
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
