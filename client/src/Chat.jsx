import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './socket';
import * as api from './api';
import Avatar from './Avatar';
import GroupAvatar from './GroupAvatar';
import { useVoiceCall } from './useVoiceCall';
import VoiceCallOverlay from './VoiceCallOverlay';

function convTitle(conv) {
  if (!conv) return '';
  if (conv.isGroup) return conv.name || 'Group';
  const u = conv.otherUser;
  return u?.display_name || u?.username || '';
}

export default function Chat({ user, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState('direct');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [listError, setListError] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const isUserOnline = useCallback((userId) => {
    if (userId == null || userId === '') return false;
    return onlineIds.has(String(Number(userId)));
  }, [onlineIds]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const key = (id) => String(Number(id));

    const onSnapshot = (payload) => {
      const ids = payload?.onlineUserIds ?? [];
      setOnlineIds(new Set(ids.map((x) => key(x))));
    };
    const onOnline = ({ userId }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        next.add(key(userId));
        return next;
      });
    };
    const onOffline = ({ userId }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        next.delete(key(userId));
        return next;
      });
    };

    socket.on('presence:snapshot', onSnapshot);
    socket.on('presence:online', onOnline);
    socket.on('presence:offline', onOffline);
    return () => {
      socket.off('presence:snapshot', onSnapshot);
      socket.off('presence:online', onOnline);
      socket.off('presence:offline', onOffline);
    };
  }, []);

  const normalizeId = (value) => {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isNaN(n)) return String(n);
    return String(value);
  };

  const parseCreatedAt = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const str = String(value);
    if (!str) return null;
    // SQLite CURRENT_TIMESTAMP is UTC like "YYYY-MM-DD HH:MM:SS"
    let normalized = str.includes('T') ? str : str.replace(' ', 'T');
    const hasZone = normalized.endsWith('Z') || /[+\-]\d{2}:\d{2}$/.test(normalized);
    if (!hasZone) normalized += 'Z';
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const loadConversations = useCallback(() => {
    return api
      .getConversations()
      .then((data) => {
        setConversations(Array.isArray(data) ? data : []);
        setListError('');
      })
      .catch((err) => {
        console.error(err);
        setListError(err?.message || 'Failed to load conversations');
      });
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setCurrentConv(null);
      setMessages([]);
      setInputValue('');
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getConversation(selectedId).then((data) => {
      setCurrentConv(data);
      setMessages(data.messages || []);
    }).catch((err) => {
      console.error(err);
      setListError(err?.message || 'Could not load chat.');
    }).finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNewMessage = (msg) => {
      const cid = msg.conversation_id ?? msg.conversation_ID;
      if (cid === selectedId || cid == null) {
        const fixed = {
          ...msg,
          created_at: msg.created_at ?? msg.CREATED_AT ?? msg.createdAt ?? new Date().toISOString(),
        };
        setMessages((prev) => {
          const id = normalizeId(fixed.id ?? fixed.ID);
          if (id != null && prev.some((m) => normalizeId(m.id ?? m.ID) === id)) return prev;
          return [...prev, fixed];
        });
      }
      loadConversations();
    };
    const onNewConversation = (conv) => {
      if (!conv?.id) return;
      setShowNewChat(false);
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
    };
    const onDeletedMessage = ({ id }) => {
      const targetId = normalizeId(id);
      if (!targetId) return;
      setMessages((prev) => prev.filter((m) => normalizeId(m.id ?? m.ID) !== targetId));
      loadConversations();
    };
    socket.on('message:new', onNewMessage);
    socket.on('conversation:new', onNewConversation);
    socket.on('message:deleted', onDeletedMessage);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('conversation:new', onNewConversation);
      socket.off('message:deleted', onDeletedMessage);
    };
  }, [selectedId, loadConversations]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const content = inputValue.trim();
    if (!content || !selectedId) return;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      // Let the server broadcast the message over socket; we don't push it manually here
      await api.sendMessage(selectedId, content);
    } catch (err) {
      console.error(err);
      setInputValue(content);
    }
  };

  const handleDeleteMessage = async (rawId) => {
    const id = normalizeId(rawId);
    if (!id) return;
    try {
      await api.deleteMessage(id);
      setMessages((prev) => prev.filter((m) => normalizeId(m.id ?? m.ID) !== id));
      loadConversations();
    } catch (err) {
      console.error(err);
      setListError(err?.message || 'Failed to delete message');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const resetNewChatForm = () => {
    setSearchTerm('');
    setUsers([]);
    setGroupName('');
    setGroupMembers([]);
    setListError('');
  };

  const openNewChat = (mode) => {
    setNewChatMode(mode);
    setShowNewChat(true);
    resetNewChatForm();
  };

  const addGroupMember = (u) => {
    if (!u?.id || u.id === user.id) return;
    setGroupMembers((prev) => (prev.some((m) => m.id === u.id) ? prev : [...prev, u]));
    setSearchTerm('');
    setUsers([]);
  };

  const removeGroupMember = (userId) => {
    setGroupMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  const createGroup = async (e) => {
    if (e) e.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setListError('Enter a group name.');
      return;
    }
    if (groupMembers.length < 1) {
      setListError('Add at least one member.');
      return;
    }
    setListError('');
    setCreatingGroup(true);
    try {
      const conv = await api.createGroup(name, groupMembers.map((m) => m.id));
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) {
          return prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c));
        }
        return [conv, ...prev];
      });
      setSelectedId(conv.id);
      setCurrentConv(conv);
      setMessages(conv.messages || []);
      setShowNewChat(false);
      resetNewChatForm();
      if (isMobile) setMobileChatOpen(true);
    } catch (err) {
      console.error(err);
      setListError(err?.message || 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const startChat = (otherUser) => {
    setListError('');
    setStartingChat(true);
    api.getOrCreateDirect(otherUser.id)
      .then((conv) => {
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === conv.id);
          if (exists) return prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c));
          return [conv, ...prev];
        });
        setSelectedId(conv.id);
        setCurrentConv(conv);
        setMessages(conv.messages || []);
        setShowNewChat(false);
        if (isMobile) setMobileChatOpen(true);
      })
      .catch((err) => {
        console.error(err);
        setListError(err?.message || 'Could not start chat. Is the server running?');
      })
      .finally(() => setStartingChat(false));
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const term = searchTerm.trim();
    setUsers([]);
    setListError('');
    if (!term) return;
    try {
      const result = await api.searchUser(term);
      setUsers(result);
      if (result.length === 0) {
        setListError('No user found with that username.');
      }
    } catch (err) {
      console.error(err);
      setListError(err.message || 'Search failed');
    }
  };

  const selectConversation = (convId) => {
    if (convId == null) return;
    setListError('');
    setSelectedId(convId);
    if (isMobile) setMobileChatOpen(true);
  };

  const isGroup = !!currentConv?.isGroup;
  const other = isGroup ? null : currentConv?.otherUser;
  const memberCount = isGroup ? (currentConv?.members?.length ?? 0) : 0;

  const switchToConversation = useCallback((convId) => {
    if (convId == null) return;
    setListError('');
    setShowNewChat(false);
    setSelectedId(convId);
    if (isMobile) setMobileChatOpen(true);
  }, [isMobile]);

  const socket = getSocket();
  const voice = useVoiceCall({
    socket,
    userId: user.id,
    selectedConversationId: selectedId,
    otherUser: other,
    onSwitchConversation: switchToConversation,
  });

  const layoutClass =
    isMobile && mobileChatOpen && selectedId
      ? 'app-layout app-layout--mobile app-layout--mobile-chat'
      : isMobile
        ? 'app-layout app-layout--mobile'
        : 'app-layout';

  return (
    <div className={layoutClass}>
      <VoiceCallOverlay voice={voice} peerUser={other} />
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand">
            <div className="brand-logo" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <div className="brand-text">
              <h1>Nexus</h1>
              <span className="brand-tagline">Messages</span>
            </div>
          </div>
          <div className="sidebar-header-actions">
            <div className="user-pill">
              <Avatar user={user} size={28} presence={!!socket?.connected} />
              <span className="user-pill-name">{user.display_name || user.username}</span>
            </div>
            <button className="btn-ghost btn-sm logout-btn" onClick={onLogout} type="button">Logout</button>
          </div>
        </header>
        {showNewChat ? (
          <>
            <div className="new-chat-header new-chat-header--tabs">
              <button
                type="button"
                className={`new-chat-tab ${newChatMode === 'direct' ? 'active' : ''}`}
                onClick={() => { setNewChatMode('direct'); resetNewChatForm(); }}
              >
                Direct
              </button>
              <button
                type="button"
                className={`new-chat-tab ${newChatMode === 'group' ? 'active' : ''}`}
                onClick={() => { setNewChatMode('group'); resetNewChatForm(); }}
              >
                Group
              </button>
            </div>
            {newChatMode === 'group' && (
              <form className="group-create-form" onSubmit={createGroup}>
                <input
                  type="text"
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => { setGroupName(e.target.value); setListError(''); }}
                  maxLength={100}
                />
                {groupMembers.length > 0 && (
                  <div className="group-member-chips">
                    {groupMembers.map((m) => (
                      <span key={m.id} className="group-member-chip">
                        {m.display_name || m.username}
                        <button type="button" onClick={() => removeGroupMember(m.id)} aria-label="Remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-primary btn-sm"
                  disabled={creatingGroup || !groupName.trim() || groupMembers.length < 1}
                >
                  {creatingGroup ? 'Creating…' : 'Create group'}
                </button>
              </form>
            )}
            <form className="new-chat-search" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search username (exact match)"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setListError('');
                  setUsers([]);
                }}
              />
              <button type="submit" className="btn-primary btn-sm">
                Search
              </button>
            </form>
            {listError && <div key="list-error" className="sidebar-error">{listError}</div>}
            {(startingChat || creatingGroup) && (
              <div key="sidebar-loading" className="sidebar-loading">
                {creatingGroup ? 'Creating group…' : 'Opening chat…'}
              </div>
            )}
            <div className="conversation-list">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="user-list-item"
                  onClick={() => (newChatMode === 'group' ? addGroupMember(u) : startChat(u))}
                  disabled={startingChat || creatingGroup}
                >
                  <Avatar user={u} size={48} presence={isUserOnline(u.id)} />
                  <span className="name">{u.display_name || u.username}</span>
                  {newChatMode === 'group' && groupMembers.some((m) => m.id === u.id) && (
                    <span className="group-added-label">Added</span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="new-chat-back-btn"
              onClick={() => { setShowNewChat(false); resetNewChatForm(); }}
            >
              ← Back to chats
            </button>
          </>
        ) : (
          <>
            <div className="new-chat-header new-chat-header--actions">
              <span className="section-label">Conversations</span>
              <div className="new-chat-actions">
                <button type="button" className="btn-secondary btn-sm" onClick={() => openNewChat('direct')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Chat
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={() => openNewChat('group')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Group
                </button>
              </div>
            </div>
            {listError && <div key="list-error" className="sidebar-error">{listError}</div>}
            <div className="conversation-list">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`conversation-item ${c.id === selectedId ? 'active' : ''}`}
                  onClick={() => selectConversation(c.id)}
                >
                  {c.isGroup ? (
                    <GroupAvatar name={c.name} size={48} />
                  ) : (
                    <Avatar user={c.otherUser} size={48} presence={isUserOnline(c.otherUser?.id)} />
                  )}
                  <div className="meta">
                    <p className="name">{convTitle(c)}</p>
                    <p className="preview">{c.lastMessage || 'No messages yet'}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
      <main className="chat-area">
        {!selectedId ? (
          <div className="empty-chat empty-chat--desktop-only">
            <div className="empty-chat-icon" aria-hidden>
              <svg viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="38" stroke="url(#emptyGrad)" strokeWidth="2" opacity="0.4" />
                <path d="M24 32c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8v6c0 4.4-3.6 8-8 8H36l-8 6.5V46c-4.4 0-8-3.6-8-8v-6z" fill="url(#emptyGrad)" opacity="0.85" />
                <defs>
                  <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#14b8a6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h2>Welcome to Nexus</h2>
            <p>Select a conversation or start a new chat to begin messaging</p>
            <div className="empty-chat-hints">
              <span className="hint-chip">Direct messages</span>
              <span className="hint-chip">Group chats</span>
              <span className="hint-chip">Voice calls</span>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
              {isMobile && (
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to chats"
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                  </svg>
                </button>
              )}
              {isGroup ? (
                <GroupAvatar name={currentConv?.name} size={42} />
              ) : (
                <Avatar user={other} size={42} presence={isUserOnline(other?.id)} />
              )}
              <div className="chat-header-main">
                <h2 className="name">{convTitle(currentConv)}</h2>
                <p className={`chat-header-presence ${!isGroup && isUserOnline(other?.id) ? 'chat-header-presence--online' : ''}`}>
                  {isGroup
                    ? `${memberCount} members`
                    : (isUserOnline(other?.id) ? 'Online' : 'Offline')}
                </p>
              </div>
              {!isGroup && (
                <button
                  type="button"
                  className="chat-call-btn"
                  onClick={() => voice.startCall()}
                  disabled={!other || voice.phase !== 'idle'}
                  title="Voice call"
                  aria-label="Start voice call"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden>
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                  </svg>
                </button>
              )}
            </header>
            <div className="chat-messages">
              {loading ? (
                <div key="loading" className="chat-loading">
                  <div className="loading-spinner" aria-hidden />
                  <p>Loading messages…</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.sender_id === user.id;
                  const msgId = msg.id ?? msg.ID ?? `msg-${index}`;
                  const createdRaw = msg.created_at ?? msg.CREATED_AT ?? msg.createdAt;
                  const createdDate = parseCreatedAt(createdRaw);
                  const canDelete = isMe;
                  const sender = msg.sender;
                  const senderLabel = sender?.display_name || sender?.username;
                  return (
                    <div key={msgId} className={`message-row ${isMe ? 'me' : ''}`}>
                      <div className="message-bubble">
                        {isGroup && !isMe && senderLabel && (
                          <p className="message-sender-name">{senderLabel}</p>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="message-delete-btn"
                            onClick={() => handleDeleteMessage(msg.id ?? msg.ID)}
                            title="Delete message (last 5 minutes only)"
                          >
                            ×
                          </button>
                        )}
                        {msg.content}
                        <div className="message-time">
                          {createdDate
                            ? createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div key="messages-end" ref={messagesEndRef} />
            </div>
          </>
        )}
        <form className="chat-input-wrap" onSubmit={handleSend}>
          <div className={`chat-input-inner ${!selectedId ? 'chat-input-disabled' : ''}`}>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                const t = e.target;
                t.style.height = 'auto';
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
              placeholder={selectedId ? 'Type a message' : 'Select a conversation to start messaging'}
              rows={1}
              disabled={!selectedId}
              onKeyDown={handleKeyDown}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
            />
            <button type="submit" className="send-btn" aria-label="Send" disabled={!selectedId || !inputValue.trim()}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
