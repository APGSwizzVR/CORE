Warning: truncated output (original token count: 38568)
Total output lines: 805

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react';
import {
  Activity, AudioLines, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CirclePlus,
  Command, Copy, Hash, Headphones, ImagePlus, LogOut, Menu, MessageCircle, Mic, MoreHorizontal,
  PanelRight, Phone, Plus, Search, Send, Settings2, Shield, Sparkles, Sticker, Volume2, Waves,
  X, Users, UserPlus, Smile, AtSign, Pencil, CheckCheck, Crown, Paperclip, MessageSquare, Moon,
  Palette, Radio, Camera, Share2, Download, Dot, LockKeyhole, SmilePlus, MoveRight, Pin, Bookmark, Flag, } from 'lucide-react';
import { api, apiBase, assetUrl, createSocket } from './api';
import type { Attachment, Channel, Conversation, FriendRequest, Invite, Member, Message, Poll, Server, ServerInvitation, Status, User } from './types';
import ImageCropper from './components/ImageCropper';
import VoiceCall from './components/VoiceCall';
import type { Socket } from 'socket.io-client';

const emoji = ['✨', '👋', '💜', '🙌', '😂', '🔥', '🎉', '🫶', '🌿', '💡', '👀', '💛'];
const stickers = [{ emoji: '🌱', label: 'A little growth' }, { emoji: '🪩', label: 'Good energy' }, { emoji: '🫧', label: 'Just floating by' }, { emoji: '☕', label: 'Coffee break' }];
const palette = { violet: '#9a8cff', ocean: '#73c7e8', moss: '#a5cd8a', rose: '#f09cb7', light: '#6575dd', system: '#9ba2b4' } as const;

function initials(name = '?') { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function groupChannels(channels: Channel[]) {
  const grouped = new Map<string, Channel[]>();
  channels.forEach((channel) => { const category = channel.category || 'THE LOUNGE'; grouped.set(category, [...(grouped.get(category) || []), channel]); });
  return [...grouped.entries()].map(([category, items]) => ({ category, items }));
}
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today at ${formatTime(value)}`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
function Avatar({ user, size = '', status = false }: { user: Pick<User, 'name' | 'avatar' | 'status'> | null; size?: string; status?: boolean }) {
  const color = user?.status === 'dnd' ? 'dnd' : user?.status || 'online';
  return <span className={`avatar ${size}`} aria-label={user?.name || 'User'}>{user?.avatar ? <img src={assetUrl(user.avatar)} alt="" /> : initials(user?.name)}{status && <i className={`presence-dot ${color}`} />}</span>;
}
function BrandMark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><b /></span>; }
function Button({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button ${className}`} {...props}>{children}</button>; }
function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>; }
function Modal({ title, kicker, onClose, children, className = '' }: { title: string; kicker?: string; onClose: () => void; children: ReactNode; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div>{kicker && <span className="eyebrow">{kicker}</span>}<h2 id="modal-title">{title}</h2></div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div>{children}</section></div>;
}
function Toast({ message, onClose }: { message: string; onClose: () => void }) { useEffect(() => { const timer = window.setTimeout(onClose, 4200); return () => window.clearTimeout(timer); }, [message]); return <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{message}<button aria-label="Dismiss notification" onClick={onClose}><X size={15} /></button></div>; }

function AuthScreen({ onAuthenticated }: { onAuthenticated: (data: { user: User; servers: Server[]; friends?: User[]; conversations?: Conversation[]; incomingRequests?: FriendRequest[]; outgoingRequests?: FriendRequest[]; incomingServerInvites?: ServerInvitation[] }) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [serverAddress, setServerAddress] = useState(localStorage.getItem('CORE_SERVER_URL') || apiBase);
  const [showServerAddress, setShowServerAddress] = useState(false);
  const [name, setName] = useState(''); const [handle, setHandle] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError('');
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register' ? { name: name.trim(), handle: handle.trim(), email: email.trim(), password } : { email: email.trim(), password };
      const data = await api<{ user: User; servers: Server[] }>(path, { method: 'POST', body: JSON.stringify(body) });
      onAuthenticated(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t sign in. Try again.'); }
    finally { setPending(false); }
  };
  const connectToServer = () => {
    const value = serverAddress.trim().replace(/\/$/, '');
    if (value) {
      try { const parsed = new URL(value); if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error(); }
      catch { setError('Use an HTTPS server address (HTTP is allowed for localhost).'); return; }
    }
    localStorage.setItem('CORE_SERVER_URL', value); window.location.reload();
  };
  return <main className="auth-shell">
    <section className="auth-visual"><div className="auth-nav"><div className="brand-lockup"><BrandMark /><span>CORE</span></div><span className="auth-version">A quieter kind of together</span></div>
      <div className="auth-art" aria-hidden="true"><div className="orb orb-a" /><div className="orb orb-b" /><div className="orb orb-c" /><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" /><div className="glow-core"><BrandMark /></div><span className="float-card float-one"><span className="mini-avatar mini-ava-a">J</span><span><b>Jules</b><small>is listening</small></span><Waves size={15} /></span><span className="float-card float-two"><span className="mini-ava-b">✦</span><span><b>the little things</b><small>4 people here</small></span><span className="online-mini" /></span><span className="float-card float-three"><span className="wave-bars"><i /><i /><i /><i /><i /><i /></span><span>your space, your pace</span></span></div>
      <div className="auth-quote"><span className="eyebrow">MAKE ROOM FOR EACH OTHER</span><h1>Good things happen<br />when we <em>show up.</em></h1><p>One place for the people you want around.</p><div className="auth-pagination"><i className="active" /><i /><i /></div></div>
      <div className="auth-foot"><span>Thoughtful by design.</span><span>CORE · 2026</span></div>
    </section>
    <section className="auth-panel"><button className="server-address-toggle" onClick={() => setShowServerAddress((value) => !value)}><Settings2 size={14} />{localStorage.getItem('CORE_SERVER_URL') ? 'Shared server' : 'Server setup'}</button><div className="auth-panel-inner"><div className="auth-mobile-brand"><BrandMark /><span>CORE</span></div><span className="eyebrow">YOUR PEOPLE ARE HERE</span><h2>{mode === 'register' ? 'Come on in.' : 'Welcome back.'}</h2><p className="auth-subhead">{mode === 'register' ? 'Create your account and make a little room.' : 'Pick up where you left off.'}</p>
      {showServerAddress && <div className="auth-server-panel"><label>CORE server address<input value={serverAddress} onChange={(e) => setServerAddress(e.target.value)} placeholder="https://chat.yourdomain.com" /></label><p>Leave blank to use this computer only. For shared conversations, enter a secure CORE server URL.</p><button className="button subtle" onClick={connectToServer}>Connect to server</button></div>}
      <form className="auth-form" onSubmit={submit}>{mode === 'register' && <><label>Your name<input autoComplete="name" required minLength={2} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" /></label><label>CORE handle<div className="input-handle"><AtSign size={15} /><input autoComplete="username" required minLength={2} maxLength={24} pattern="[a-zA-Z0-9_.-]+" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" /></div></label></>}
        <label>Email address<input autoComplete="email" type="email" required maxLength={180} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input autoComplete={mode === 'register' ? 'new-password' : 'current-password'} type="password" required minLength={mode === 'register' ? 8 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}<button className="button primary auth-submit" disabled={pending}>{pending ? 'One moment…' : mode === 'register' ? 'Create your account' : 'Sign in'}<ChevronRight size={17} /></button>
      </form><div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to CORE?'} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></div><div className="auth-trust"><LockKeyhole size={13} /> Your account is stored securely on your CORE server.</div></div><div className="auth-legal">By continuing, you agree to be kind to each other. <a href="https://github.com" target="_blank" rel="noreferrer">About CORE</a></div></section>
  </main>;
}

type ModalKind = 'profile' | 'server' | 'serverSettings' | 'channel' | 'channelSettings' | 'invite' | 'friends' | 'groupDM' | 'poll' | 'members' | 'assets' | 'events' | 'moderation' | 'report' | 'settings' | null;
type SearchHit = Message & { channelName?: string; serverId?: string; serverName?: string; conversationName?: string };

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [incomingServerInvites, setIncomingServerInvites] = useState<ServerInvitation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [serverInboxOpen, setServerInboxOpen] = useState(false);
  const [modalServerId, setModalServerId] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<Message | null>(null);
  const [toast, setToast] = useState('');
  const [page, setPage] = useState<'chat' | 'friends' | 'dms'>('chat');
  const [rightOpen, setRightOpen] = useState(true);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [profilePeek, setProfilePeek] = useState<User | null>(null);
  const [dmVoiceCounts, setDmVoiceCounts] = useState<Record<string, number>>({});
  const [serverAssets, setServerAssets] = useState<Array<{ id: string; type: 'emoji' | 'sticker' | 'sound'; name: string; url: string; mime: string }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHas, setSearchHas] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [searchAfter, setSearchAfter] = useState('');
  const [searchBefore, setSearchBefore] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [jumpMessageId, setJumpMessageId] = useState('');
  const [sendText, setSendText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [composerOpen, setComposerOpen] = useState<'emoji' | 'sticker' | 'sound' | null>(null);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const activeServer = servers.find((server) => server.id === activeServerId) || null;
  const modalServer = servers.find((server) => server.id === modalServerId) || activeServer;
  const activeChannel = activeServer?.channels.find((channel) => channel.id === activeChannelId) || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const isOwner = Boolean(activeServer?.members?.find((member) => member.userId === user?.id && ['owner', 'admin'].includes(member.role)));
  const activeChannelRef = useRef(activeChannelId);
  const activeConversationRef = useRef(activeConversationId);
  const activeThreadRef = useRef<Message | null>(activeThread);
  useEffect(() => { activeChannelRef.current = activeChannelId; activeConversationRef.current = activeConversationId; activeThreadRef.current = activeThread; }, [activeChannelId, activeConversationId, activeThread]);

  const applySession = useCallback((data: { user: User; servers: Server[]; friends?: User[]; conversations?: Conversation[]; incomingRequests?: FriendRequest[]; outgoingRequests?: FriendRequest[]; incomingServerInvites?: ServerInvitation[] }) => {
    setUser(data.user); setServers(data.servers || []); setFriends(data.friends || []); setConversations(data.conversations || []); setIncomingRequests(data.incomingRequests || []); setOutgoingRequests(data.outgoingRequests || []); setIncomingServerInvites(data.incomingServerInvites || []);
    const first = data.servers?.[0];
    setActiveServerId(first?.id || null);
    setActiveChannelId(first?.channels?.find((channel) => channel.kind === 'text')?.id || null);
  }, []);

  useEffect(() => {
    api<{ user: User; servers: Server[]; friends: User[]; conversations: Conversation[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[]; incomingServerInvites: ServerInvitation[] }>('/api/auth/me').then((data) => {
      setUser(data.user); setServers(data.servers); setFriends(data.friends); setConversations(data.conversations); setIncomingRequests(data.incomingRequests || []); setOutgoingRequests(data.outgoingRequests || []); setIncomingServerInvites(data.incomingServerInvites || []);
      setActiveServerId(data.servers[0]?.id || null); setActiveChannelId(data.servers[0]?.channels?.find((c) => c.kind === 'text')?.id || null);
    }).catch(() => {}).finally(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
      if (event.key === 'Escape') { setModal(null); setComposerOpen(null); setSearchOpen(false); setNavOpen(false); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!searchOpen || term.length < 2) { setSearchResults([]); setSearching(false); return; }
    let current = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: term });
      if (searchHas) params.set('has', searchHas);
      if (searchAuthor.trim()) params.set('author', searchAuthor.trim());
      if (searchAfter) params.set('after', new Date(`${searchAfter}T00:00:00`).toISOString());
      if (searchBefore) params.set('before', new Date(`${searchBefore}T23:59:59`).toISOString());
      api<{ results: SearchHit[] }>(`/api/search?${params.toString()}`).then(({ results }) => { if (current) setSearchResults(results); }).catch(() => { if (current) setSearchResults([]); }).finally(() => { if (current) setSearching(false); });
    }, 240);
    return () => { current = false; window.clearTimeout(timer); };
  }, [searchOpen, query, searchHas, searchAuthor, searchAfter, searchBefore]);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    let x = window.innerWidth * .5; let y = window.innerHeight * .45;
    let targetX = x; let targetY = y; let frame = 0;
    const paint = () => {
      x += (targetX - x) * .16; y += (targetY - y) * .16;
      root.style.setProperty('--cursor-x', `${x}px`); root.style.setProperty('--cursor-y', `${y}px`);
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > .8) frame = requestAnimationFrame(paint); else frame = 0;
    };
    const move = (event: PointerEvent) => {
      targetX = event.clientX; targetY = event.clientY;
      root.style.setProperty('--cursor-light', '1');
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => root.style.setProperty('--cursor-light', '0');
    window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerleave', leave); if (frame) cancelAnimationFrame(frame); root.style.removeProperty('--cursor-light'); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const live = createSocket(); setSocket(live);
    live.on('connect', () => setOnlineIds((current) => [...new Set([...current, user.id])]));
    live.on('presence:snapshot', (ids: string[]) => setOnlineIds([...new Set([...ids, user.id])]));
    live.on('presence:update', ({ userId, online }: { userId: string; online: boolean }) => setOnlineIds((current) => online ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    live.on('chat:message', (message: Message) => {
      if (message.threadParentId) {
        if (message.threadParentId === activeThreadRef.current?.id) setThreadMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        return;
      }
      const belongs = message.scope === 'channel' ? message.channelId === activeChannelRef.current : message.conversationId === activeConversationRef.current;
      if (belongs) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    live.on('chat:update', (message: Message) => { setMessages((current) => current.map((item) => item.id === message.id ? message : item)); setThreadMessages((current) => current.map((item) => item.id === message.id ? message : item)); if (activeThreadRef.current?.id === message.id) setActiveThread(message); });
    live.on('chat:delete', ({ messageId }: { messageId: string }) => { setMessages((current) => current.filter((item) => item.id !== messageId)); setThreadMessages((current) => current.filter((item) => item.id !== messageId)); if (activeThreadRef.current?.id === messageId) setActiveThread(null); });
    live.on('chat:typing', ({ userId, name, typing: isTyping }: { userId: string; name: string; typing: boolean }) => {
      if (userId === user.id) return;
      setTyping((current) => isTyping ? current.includes(name) ? current : [...current, name] : current.filter((item) => item !== name));
      window.setTimeout(() => setTyping((current) => current.filter((item) => item !== name)), 3000);
    });
    live.on('voice:presence', ({ channelId, count }: { channelId: string; count: number }) => {
      setServers((current) => current.map((server) => ({ ...server, channels: server.channels.map((channel) => channel.id === channelId ? { ...channel, topic: `${count} ${count === 1 ? 'person' : 'people'} connected` } : channel) })));
    });
    live.on('voice:dm-presence', ({ conversationId, count }: { conversationId: string; count: number }) => setDmVoiceCounts((current) => ({ ...current, [conversationId]: count })));
    const refreshSocial = () => { void api<{ friends: User[]; conversations: Conversation[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[]; incomingServerInvites: ServerInvitation[] }>('/api/auth/me').then((data) => { setFriends(data.friends); setConversations(data.conversations); setIncomingRequests(data.incomingRequests || []); setOutgoingRequests(data.outgoingRequests || []); setIncomingServerInvites(data.incomingServerInvites || []); }).catch(() => {}); };
    live.on('friend:request', refreshSocial); live.on('friend:updated', refreshSocial); live.on('dm:created', refreshSocial); live.on('server:invite', refreshSocial); live.on('server:invite-updated', refreshSocial);
    live.on('server:channels-updated', ({ serverId }: { serverId: string }) => {
      void api<{ servers: Server[] }>('/api/auth/me').then(({ servers: latest }) => {
        setServers(latest);
        const updatedServer = latest.find((item) => item.id === serverId);
        if (updatedServer && activeChannelRef.current && !updatedServer.channels.some((channel) => channel.id === activeChannelRef.current)) {
          setActiveChannelId(updatedServer.channels.find((channel) => channel.kind === 'text')?.id || null);
          setVoiceChannelId(null);
        }
      }).catch(() => {});
    });
    live.on('server:updated', () => { void api<{ servers: Server[] }>('/api/auth/me').then(({ servers: latest }) => setServers(latest)).catch(() => {}); });
    return () => { live.disconnect(); setSocket(null); };
  }, [user?.id]);

  useEffect(() => {
    setServerAssets([]);
    if (!user || !activeServerId) return;
    let live = true;
    api<{ assets: typeof serverAssets }>(`/api/servers/${activeServerId}/assets`).then(({ assets }) => { if (live) setServerAssets(assets); }).catch(() => {});
    return () => { live = false; };
  }, [user?.id, activeServerId]);

  useEffect(() => {
    if (!user) return;
    const basePath = activeChannelId ? `/api/channels/${activeChannelId}/messages` : activeConversationId ? `/api/conversations/${activeConversationId}/messages` : '';
    const path = basePath ? `${basePath}${jumpMessageId ? `?around=${encodeURIComponent(jumpMessageId)}` : ''}` : '';
    if (!path) { setMessages([]); return; }
    let current = true; setMessages([]);
    api<{ messages: Message[] }>(path).then(({ messages: list }) => { if (current) setMessages(list); }).catch((error) => { if (current) setToast(error.message); });
    return () => { current = false; };
  }, [user?.id, activeChannelId, activeConversationId, jumpMessageId]);

  useEffect(() => {
    setPinnedMessages([]); setPinnedOpen(false);
    if (!user || !activeChannelId || activeChannel?.kind !== 'text') return;
    let current = true;
    api<{ messages: Message[] }>(`/api/channels/${activeChannelId}/pins`).then(({ messages: list }) => { if (current) setPinnedMessages(list); }).catch(() => {});
    return () => { current = false; };
  }, [user?.id, activeChannelId, activeChannel?.kind]);

  useEffect(() => {
    const inviteId = new URLSearchParams(location.search).get('invite');
    if (!user || !inviteId) return;
    api<{ server: Server }>(`/api/invites/${encodeURIComponent(inviteId)}/accept`, { method: 'POST' }).then(({ server }) => {
      setServers((current) => current.some((item) => item.id === server.id) ? current : [...current, server]);
      setActiveServerId(server.id); setActiveChannelId(server.channels.find((c) => c.kind === 'text')?.id || null); setToast(`You joined ${server.name}.`);
      history.replaceState({}, '', location.pathname);
    }).catch((error) => { setToast(error.message); history.replaceState({}, '', location.pathname); });
  }, [user?.id]);

  const refreshSession = useCallback(async () => {
    const data = await api<{ user: User; servers: Server[]; friends: User[]; conversations: Conversation[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[]; incomingServerInvites: ServerInvitation[] }>('/api/auth/me');
    setUser(data.user); setServers(data.servers); setFriends(data.friends); setConversations(data.conversations); setIncomingRequests(data.incomingRequests || []); setOutgoingRequests(data.outgoingRequests || []); setIncomingServerInvites(data.incomingServerInvites || []);
  }, []);
  const selectServer = (server: Server) => { setPage('chat'); setActiveServerId(server.id); setActiveChannelId(server.channels.find((c) => c.kind === 'text')?.id || null); setActiveConversationId(null); setVoiceChannelId(null); setSendText(''); setAttachments([]); setActiveThread(null); setThreadMessages([]); setPinnedOpen(false); setJumpMessageId(''); setNavOpen(false); };
  const selectChannel = (channel: Channel) => { setPage('chat'); setActiveServerId(channel.serverId); setActiveChannelId(channel.id); setActiveConversationId(null); setVoiceChannelId(channel.kind === 'voice' ? channel.id : null); setSendText(''); setAttachments([]); setJumpMessageId(''); setActiveThread(null); setThreadMessages([]); setPinnedOpen(false); setNavOpen(false); };
  const selectConversation = (conversation: Conversation) => { setPage('dms'); setActiveConversationId(conversation.id); setActiveChannelId(null); setVoiceChannelId(null); setSendText(''); setAttachments([]); setJumpMessageId(''); setActiveThread(null); setThreadMessages([]); setPinnedOpen(false); setNavOpen(false); };
  const selectSearchResult = (hit: SearchHit) => {
    setJumpMessageId(hit.id); setSearchOpen(false); setQuery(''); setSearchAuthor(''); setSearchHas(''); setSearchBefore(''); setSearchAfter('');
    setActiveThread(null); setThreadMessages([]); setPinnedOpen(false);
    if (hit.scope === 'channel' && hit.channelId && hit.serverId) {
      setPage('chat'); setActiveServerId(hit.serverId); setActiveChannelId(hit.channelId); setActiveConversationId(null); setVoiceChannelId(null); setNavOpen(false);
    } else if (hit.conversationId) {
      const conversation = conversations.find((item) => item.id === hit.conversationId);
      if (conversation) { setPage('dms'); setActiveConversationId(conversation.id); setActiveChannelId(null); setVoiceChannelId(null); setNavOpen(false); }
    }
  };
  const uploadAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (attachments.length + selected.length > 5) { setToast('Add up to five attachments per message.'); return; }
    setUploadingAttachments(true);
    try {
      const uploaded = await Promise.all(selected.map(async (file) => {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(`Couldn’t read ${file.name}.`)); reader.readAsDataURL(file); });
        const { attachment } = await api<{ attachment: Attachment }>('/api/attachments', { method: 'POST', body: JSON.stringify({ name: file.name, dataUrl }) });
        return attachment;
      }));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t upload that attachment.'); }
    finally { setUploadingAttachments(false); if (attachmentInput.current) attachmentInput.current.value = ''; }
  };
  const sendMessage = (value = sendText, threadParentId?: string) => {
    const text = value.trim(); const files = value === sendText ? attachments : [];
    if ((!text && !files.length) || !socket) return;
    const parentId = threadParentId || activeThread?.id;
    const payload = activeConversationId ? { scope: 'dm', conversationId: activeConversationId, text, attachments: files, threadParentId: parentId } : { scope: 'channel', channelId: activeChannelId, text, attachments: files, threadParentId: parentId };
    if (!activeChannelId && !activeConversationId) return;
    socket.emit('chat:send', payload, (result: { error?: string }) => { if (result?.error) setToast(result.error); });
    if (value === sendText) { setSendText(''); setAttachments([]); if (composer.current) composer.current.style.height = 'auto'; }
    setComposerOpen(null);
  };
  const openThread = async (message: Message) => {
    try { const result = await api<{ parent: Message; messages: Message[] }>(`/api/messages/${message.id}/thread`); setActiveThread(result.parent); setThreadMessages(result.messages); setPinnedOpen(false); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t open this thread.'); }
  };
  const togglePin = async (message: Message) => {
    try {
      const result = await api<{ message: Message }>(`/api/messages/${message.id}/pin`, { method: message.pinnedAt ? 'DELETE' : 'POST' });
      setMessages((current) => current.map((item) => item.id === result.message.id ? result.message : item));
      setPinnedMessages((current) => message.pinnedAt ? current.filter((item) => item.id !== message.id) : [result.message, ...current]);
      setToast(message.pinnedAt ? 'Message unpinned.' : 'Message pinned for this channel.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t update this pin.'); }
  };
  const createPoll = async (question: string, options: string[]) => {
    const payload = activeConversationId ? { scope: 'dm', conversationId: activeConversationId, question, options } : { scope: 'channel', channelId: activeChannelId, question, options };
    if (!activeChannelId && !activeConversationId) throw new Error('Choose a conversation before creating a poll.');
    await api('/api/polls', { method: 'POST', body: JSON.stringify(payload) });
    setModal(null); setToast('Poll is ready for everyone.');
  };
  const votePoll = async (messageId: string, optionId: string) => {
    try { const { message } = await api<{ message: Message }>(`/api/messages/${messageId}/poll`, { method: 'PUT', body: JSON.stringify({ optionId }) }); setMessages((current) => current.map((item) => item.id === messageId ? message : item)); setThreadMessages((current) => current.map((item) => item.id === messageId ? message : item)); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t record your vote.'); }
  };
  const editMessage = async (messageId: string, text: string) => {
    try { const { message } = await api<{ message: Message }>(`/api/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ text }) }); setMessages((current) => current.map((item) => item.id === message.id ? message : item)); return true; }
    catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t edit this message.'); return false; }
  };
  const deleteMessage = async (messageId: string) => {
    try { await api(`/api/messages/${messageId}`, { method: 'DELETE' }); setMessages((current) => current.filter((item) => item.id !== messageId)); return true; }
    catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t remove this message.'); return false; }
  };
  const reactToMessage = async (messageId: string, emoji: string) => {
    try { const { message } = await api<{ message: Message }>(`/api/messages/${messageId}/reactions`, { method: 'PUT', body: JSON.stringify({ emoji }) }); setMessages((current) => current.map((item) => item.id === message.id ? message : item)); return true; }
    catch (error) { setToast(error instanceof Error ? error.message : 'Couldn’t add this reaction.'); return false; }
  };
  const submitReport = async (message: Message, reason: string, details: string) => {
    await api('/api/reports', { method: 'POST', body: JSON.stringify({ messageId: message.id, reason, details }) });
    setReportMessage(null); setModal(null); setToast('Thanks for letting the space team know.');
  };
  const inputChanged = (value: string) => {
    setSendText(value);
    if (socket && activeChannelId) socket.emit('chat:typing', { scope: 'channel', channelId: activeChannelId, typing: true });
    else if (socket && activeConversationId) socket.emit('chat:typing', { scope: 'dm', conversationId: activeConversationId, typing: true });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      if (socket && activeChannelId) socket.emit('chat:typing', { scope: 'channel', channelId: activeChannelId, typing: false });
      else if (socket && activeConversationId) socket.emit('chat:typing', { scope: 'dm', conversationId: activeConversationId, typing: false });
    }, 1000);
  };
  const openInvite = async () => { if (!activeServer) return; setModalServerId(activeServer.id); setModal('invite'); };
  const createServer = async (name: string, images?: { icon?: string; banner?: string }) => {
    const server = await api<Server>('/api/servers', { method: 'POST', body: JSON.stringify({ name }) });
    const updated = { ...server };
    for (const [type, dataUrl] of [['serverIcon', images?.icon], ['serverBanner', images?.banner]] as const) {
      if (!dataUrl) continue;
      try { const result = await api<{ server: Server }>('/api/profile/asset', { method: 'POST', body: JSON.stringify({ type, dataUrl, serverId: server.id }) }); Object.assign(updated, result.server); }
      catch { setToast('Your space is ready. You can add its image from space extras.'); }
    }
    setServers((current) => [...current, updated]); setActiveServerId(server.id); setActiveChannelId(server.channels.find((c) => c.kind === 'text')?.id || null); setActiveConversationId(null); setPage('chat'); setModal(null); setToast(`${server.name} is ready.`);
  };
  const createChannel = async (values: Omit<Channel, 'id' | 'serverId' | 'position'>) => {
    const serverId = modalServerId || activeServer?.id;
    if (!serverId) return;
    const { channel } = await api<{ channel: Channel }>(`/api/servers/${serverId}/channels`, { method: 'POST', body: JSON.stringify(values) });
    setServers((current) => current.map((server) => server.id === serverId ? { ...server, channels: [...server.channels, channel] } : server)); setModal(null); selectChannel(channel); setToast(`${values.kind === 'text' ? 'Text' : 'Voice'} channel created.`);
  };
  const saveChannel = async (channelId: string, values: Omit<Channel, 'id' | 'serverId' | 'position' | 'kind'>) => {
    const { channel } = await api<{ channel: Channel }>(`/api/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(values) });
    setServers((current) => current.map((server) => server.id === channel.serverId ? { ...server, channels: server.channels.map((item) => item.id === channel.id ? channel : item) } : server)); setModal(null); setToast('Channel settings saved.');
  };
  const saveServerSettings = async (serverId: string, values: { name: string; description: string }) => {
    const { server } = await api<{ server: Server }>(`/api/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(values) });
    setServers((current) => current.map((item) => item.id === serverId ? { ...item, ...server } : item));
    setModal(null); setToast('Space details saved.');
  };
  const openServerModal = (kind: ModalKind, serverId?: string) => { setModalServerId(serverId || activeServerId); setModal(kind); };
  const directInvite = async (handle: string) => {
    const result = await api<{ friend: User; accepted?: boolean }>('/api/friends', { method: 'POST', body: JSON.stringify({ handle }) });
    await refreshSession(); setToast(result.accepted ? `You and ${result.friend.name} are friends now.` : `Friend request sent to ${result.friend.name}.`); setModal(null);
  };
  const acceptFriendRequest = async (request: FriendRequest) => { await api(`/api/friend-requests/${request.id}/accept`, { method: 'POST' }); await refreshSession(); setToast(`${request.user.name} is in your circle.`); };
  const dismissFriendRequest = async (request: FriendRequest) => { await api(`/api/friend-requests/${request.id}`, { method: 'DELETE' }); await refreshSession(); setToast('Friend request dismissed.'); };
  const acceptServerInvite = async (invitation: ServerInvitation) => {
    const { server } = await api<{ server: Server }>(`/api/server-invites/${invitation.id}/accept`, { method: 'POST' });
    await refreshSession(); setActiveServerId(server.id); setActiveChannelId(server.channels.find((channel) => channel.kind === 'text')?.id || null); setActiveConversationId(null); setPage('chat'); setToast(`You joined ${server.name}.`);
  };
  const declineServerInvite = async (invitation: ServerInvitation) => { await api(`/api/server-invites/${invitation.id}/decline`, { method: 'POST' }); await refreshSession(); setToast(`Invitation to ${invitation.server.name} dismissed.`); };
  const sendServerInvites = async (serverId: string, friendIds: string[], expiryHours: number) => {
    const result = await api<{ invited: User[]; skipped: number }>(`/api/servers/${serverId}/direct-invites`, { method: 'POST', body: JSON.stringify({ friendIds, expiryHours }) });
    await refreshSession(); setModal(null);
    setToast(result.invited.length ? `Invited ${result.invited.length} friend${result.invited.length === 1 ? '' : 's'} to ${servers.find((server) => server.id === serverId)?.name || 'your space'}.` : 'Those friends are already in this space or have a pending invite.');
  };
  const createGroupDM = async (memberIds: string[], name: string) => {
    const { conversation } = await api<{ conversation: Conversation }>('/api/conversations', { method: 'POST', body: JSON.stringify({ memberIds, name: name.trim() || undefined }) });
    await refreshSession(); selectConversation(conversation); setModal(null); setToast('Group conversation created.');
  };
  const updateProfile = async (values: { name: string; bio: string; status: Status; theme: User['theme'] }) => {
    const { user: updated } = await api<{ user: User }>('/api/profile', { method: 'PATCH', body: JSON.stringify(values) });
    setUser(updated); document.documentElement.dataset.theme = updated.theme; setModal(null); setToast('Your profile is up to date.');
  };
  const saveUserImage = async (type: 'avatar' | 'banner', dataUrl: string) => {
    const { user: updated } = await api<{ user: User }>('/api/profile/asset', { method: 'POST', body: JSON.stringify({ type, dataUrl }) }); setUser(updated); setToast(type === 'avatar' ? 'Profile photo saved.' : 'Profile banner saved.');
  };
  const logout = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} setSocket(null); setUser(null); setServers([]); setFriends([]); setIncomingRequests([]); setOutgoingRequests([]); setIncomingServerInvites([]); setConversations([]); setMessages([]); setVoiceChannelId(null); };

  const theme = user?.theme || 'violet';
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const filteredFriends = useMemo(() => friends.filter((friend) => `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase())), [friends, query]);
  const displayName = activeConversation ? (activeConversation.isGroup ? activeConversation.name : activeConversation.otherUser?.name) || 'Conversation' : activeChannel?.name || 'Find your people';
  const channelMessages = messages;
  const onlineFriendCount = friends.filter((friend) => onlineIds.includes(friend.id)).length;
  const openMessageProfile = (message: Message) => {
    const people = [user, ...friends, ...(activeServer?.members || []).map((member) => member.user), ...(activeConversation?.members || []), ...conversations.flatMap((conversation) => [conversation.otherUser, ...(conversation.members || [])])].filter((person): person is User => Boolean(person));
    const known = people.find((person) => person.id === message.authorId);
    setProfilePeek(known || {
      id: message.authorId, name: message.author, handle: message.handle || message.author.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'member',
      avatar: message.avatar, banner: null, bio: '', status: onlineIds.includes(message.authorId) ? 'online' : 'idle', theme: 'violet',
    });
  };

  if (!user) return bootstrapping ? <main className="auth-loading"><BrandMark /><span>Opening your space…</span></main> : <AuthScreen onAuthenticated={(data) => { applySession(data); setToast('Welcome to CORE.'); }} />;

  return <main className={`app-shell ${navOpen ? 'mobile-nav-open' : ''}`}>
    <div className="cursor-aura" aria-hidden="true" />
    <aside className="server-rail" aria-label="Spaces"><div className="rail-brand"><BrandMark /></div><div className="rail-rule" />
      <button className={`rail-icon home ${page !== 'chat' || !activeServer ? 'selected' : ''}`} aria-label="Direct messages" title="Direct messages" onClick={() => { setPage('dms'); setActiveConversationId(conversations[0]?.id || null); setActiveChannelId(null); setVoiceChannelId(null); setNavOpen(false); }}><MessageCircle size={20} /><i className="rail-pill" /></button>
      <div className="rail-scroll">{servers.map((server) => <button key={server.id} className={`rail-icon ${server.id === activeServerId && page === 'chat' ? 'selected' : ''}`} aria-label={server.name} title={server.name} onClick={() => selectServer(server)}><span className="rail-server">{server.icon ? <img src={assetUrl(server.icon)} alt="" /> : initials(server.name)}</span><i className="rail-pill" /></button>)}</div>
      <button className="rail-icon rail-add" aria-label="Create a space" title="Create a space" onClick={() => setModal('server')}><Plus size={20} /></button><button className="rail-icon rail-discover" aria-label="Find friends" title="Find friends" onClick={() => setModal('friends')}><UserPlus size={18} /></button>
      <div className="rail-bottom"><button className="rail-icon rail-help" aria-label="Help and setup" title="Help and setup" onClick={() => setModal('settings')}><CircleHelp size={18} /></button></div>
    </aside>

    <aside className={`nav-panel ${navOpen ? 'open' : ''}`}>
      <div className="nav-heading"><div className="nav-title"><span className="brand-lockup"><BrandMark /><b>CORE</b></span><span className="nav-divider" />{activeServer ? <button className="space-menu" onClick={() => openServerModal('serverSettings')}><span className="space-name">{activeServer.name}</span><ChevronDown size={15} /></button> : <span className="space-name">Your space</span>}</div><IconButton label="Close navigation" className="mobile-close" onClick={() => setNavOpen(false)}><X size={17} /></IconButton></div>
      <button className="nav-search" onClick={() => setSearchOpen((v) => !v)}><Search size={15} /><span>Search messages & people</span><kbd><Command size={10} /> K</kbd></button>
      {searchOpen && <div className="search-panel"><Search size={14} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a message or person" /><IconButton label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); setSearchResults([]); }}><X size={14} /></IconButton></div>}
      {searchOpen && query.trim().length >= 2 && <div className="search-results-panel"><div className="search-filter-row"><label>By person<input value={searchAuthor} onChange={(event) => setSearchAuthor(event.target.value)} placeholder="Name or handle" /></label><label>Has<select value={searchHas} onChange={(event) => setSearchHas(event.target.value)}><option value="">Anything</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="file">Files</option></select></label></div><div className="search-filter-row date-filters"><label>After<input type="date" value={searchAfter} onChange={(event) => setSearchAfter(event.target.value)} /></label><label>Before<input type="date" value={searchBefore} onChange={(event) => setSearchBefore(event.target.value)} /></label></div><div className="search-result-heading">{searching ? 'Searching…' : `${searchResults.length} ${searchResults.length === 1 ? 'message' : 'messages'}`}</div>{searching ? <div className="search-result-empty"><span className="share-loader" />Looking through your conversations…</div> : searchResults.length ? <div className="search-result-list">{searchResults.map((hit) => <button key={hit.id} className="search-result" onClick={() => selectSearchResult(hit)}><Avatar user={{ name: hit.author, avatar: hit.avatar, status: 'online' }} /><span className="search-result-copy"><span><b>{hit.author}</b><small>{hit.scope === 'channel' ? `${hit.serverName} · #${hit.channelName}` : hit.conversationName || 'Direct message'}</small></span><p>{hit.text || hit.attachments?.map((file) => `📎 ${file.name}`).join(' · ') || 'Attachment'}</p><time>{timeLabel(hit.createdAt)}</time></span></button>)}</div> : <div className="search-result-empty"><Search size={16} />No messages matched. Try a shorter phrase or adjust your filters.</div>}</div>}

      <div className="nav-scroll">
        {!activeServer || page !== 'chat' ? <><div className="nav-section-title"><span>YOUR SPACE</span><button aria-label="Add a friend" title="Add a friend" onClick={() => setModal('friends')}><Plus size={15} /></button></div>
          <button className={`nav-item ${page === 'dms' && !activeConversationId ? 'active' : ''}`} onClick={() => { setPage('dms'); setActiveConversationId(null); setActiveChannelId(null); }}><MessageCircle size={17} /><span>Messages</span>{conversations.length > 0 && <small className="nav-count">{conversations.length}</small>}</button>
          <button className={`nav-item ${page === 'friends' ? 'active' : ''}`} onClick={() => { setPage('friends'); setActiveChannelId(null); setActiveConversationId(null); }}><Users size={17} /><span>Friends</span><small className="nav-count">{incomingRequests.length + incomingServerInvites.length || onlineFriendCount}</small></button>
          <div className="nav-section-title dm-section"><span>DIRECT MESSAGES</span><button aria-label="Start a conversation" title="Start a conversation" onClick={() => setModal('friends')}><Plus size={15} /></button></div>
          {conversations.map((conversation) => <button key={conversation.id} className={`dm-row ${activeConversationId === conversation.id ? 'active' : ''}`} onClick={() => selectConversation(conversation)}><Avatar user={conversation.otherUser} status={!conversation.isGroup} /><span className="dm-name">{conversation.isGroup ? conversation.name : conversation.otherUser.name}</span><span className="dm-presence">{conversation.isGroup ? `${conversation.members?.length || conversation.memberIds.length} people` : onlineIds.includes(conversation.otherUser.id) ? 'Here now' : 'Away'}</span></button>)}
          {conversations.length === 0 && <div className="nav-empty"><span className="nav-empty-icon"><MessageCircle size={17} /></span><p>Good conversations<br />start with a hello.</p><button onClick={() => setModal('friends')}>Find someone</button></div>}
        </> : <><div className="server-banner" style={activeServer.banner ? { backgroundImage: `linear-gradient(180deg,rgba(16,18,25,.05),rgba(16,18,25,.95)),url(${assetUrl(activeServer.banner)})` } : undefined}><div className="server-banner-top"><span className="eyebrow">YOUR SPACE</span><button className="banner-menu" title="Space settings" onClick={() => openServerModal('serverSettings')}><Settings2 size={16} /></button></div><div className="server-hero-mark">{activeServer.icon ? <img src={assetUrl(activeServer.icon)} alt="" /> : initials(activeServer.name)}</div><h2>{activeServer.name}</h2><p>{activeServer.description || 'A good place to be.'}</p><div className="server-people"><span className="live-dot" />{activeServer.members?.length || 1} {activeServer.members?.length === 1 ? 'person' : 'people'} here</div></div>
          <div className="nav-section-title"><span>TEXT CHANNELS</span>{isOwner && <button aria-label="Create text channel" title="Create text channel" onClick={() => { setModalServerId(activeServer.id); setModal('channel'); }}><Plus size={15} /></button>}</div>
          {groupChannels(activeServer.channels.filter((channel) => channel.kind === 'text')).map(({ category, items }) => <div className="channel-group" key={category}><div className="channel-category-label">{category}</div>{items.map((channel) => <button key={channel.id} className={`channel-row ${activeChannelId === channel.id ? 'active' : ''}`} title={channel.topic || `#${channel.name}`} onClick={() => selectChannel(channel)}><Hash size={16} /><span>{channel.name}</span>{channel.slowModeSeconds ? <small className="channel-slowmode" title={`Slow mode: ${channel.slowModeSeconds} seconds`}><LockKeyhole size={11} /></small> : null}</button>)}</div>)}
          <div className="nav-section-title voice-heading"><span>VOICE CHANNELS</span>{isOwner && <button aria-label="Create voice channel" title="Create voice channel" onClick={() => { setModalServerId(activeServer.id); setModal('channel'); }}><Plus size={15} /></button>}</div>
          {groupChannels(activeServer.channels.filter((channel) => channel.kind === 'voice')).map(({ category, items }) => <div className="channel-group" key={category}><div className="channel-category-label">{category}</div>{items.map((channel) => <div key={channel.id}><button className={`channel-row voice-row ${voiceChannelId === channel.id ? 'active' : ''}`} title={channel.topic || `Voice: ${channel.name}`} onClick={() => selectChannel(channel)}><Volume2 size={16} /><span>{channel.name}</span>{channel.topic?.includes('connected') && <small className="voice-count">{channel.topic.split(' ')[0]}</small>}</button>{voiceChannelId === channel.id && <div className="voice-mini-status"><span className="audio-status-dot" />You’re connected <button onClick={() => setVoiceChannelId(null)}>Leave</button></div>}</div>)}</div>)}
          <div className="nav-section-title server-tools"><span>GOOD EXTRAS</span><button aria-label="Manage community extras" title="Manage community extras" onClick={() => openServerModal('assets')}><Plus size={15} /></button></div>
          <button className="channel-row" onClick={() => openServerModal('events')}><CalendarDays size={16} /><span>Upcoming events</span></button>
          <button className="channel-row" onClick={() => openServerModal('assets')}><Sparkles size={16} /><span>Emoji & stickers</span></button><button className="channel-row" onClick={() => { setComposerOpen('sound'); setToast('Open soundboard from the message box to play a sound.'); setActiveChannelId(activeServer.channels.find((c) => c.kind === 'text')?.id || null); }}><AudioLines size={16} /><span>Soundboard</span></button>
          <button className="server-invite-shortcut" onClick={openInvite}><UserPlus size={15} /><span>Invite someone</span><ChevronRight size={14} /></button>
        </>}
      </div>
      <div className="user-dock"><button className="user-card" onClick={() => setModal('profile')}><Avatar user={user} status /><span className="user-card-details"><b>{user.name}</b><small>@{user.handle}</small></span><span className="user-status-mark"><span className={`presence-dot ${user.status}`} /></span></button><div className="user-actions"><IconButton label="User settings" onClick={() => setModal('profile')}><Settings2 size={17} /></IconButton><IconButton label="Sign out" onClick={logout}><LogOut size={16} /></IconButton></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={19} /></button><button className="crumb-back" aria-label="Back to spaces" onClick={() => setNavOpen(true)}><ChevronLeft size={15} /></button><div className="crumb-icon">{page === 'friends' ? <Users size={17} /> : page === 'dms' ? <MessageCircle size={17} /> : activeChannel?.kind === 'voice' ? <Volume2 size={17} /> : <Hash size={17} />}</div><div className="topbar-title"><strong>{page === 'friends' ? 'Friends' : page === 'dms' && !activeConversation ? 'Messages' : displayName}</strong><span>{page === 'friends' ? 'Your circle, at a glance.' : activeConversation ? `@${activeConversation.otherUser.handle}` : activeChannel?.topic || (activeServer ? activeServer.name : 'The people who make life good')}</span></div>
        <div className="topbar-actions"><span className="connection-indicator"><i className={`connection-dot ${socket?.connected ? 'live' : ''}`} />{socket?.connected ? 'Live' : 'Offline'}</span><IconButton label={`${incomingServerInvites.length} server invitations`} className="server-inbox-button" onClick={() => setServerInboxOpen(true)}><Bell size={17} />{incomingServerInvites.length > 0 && <i className="server-inbox-badge">{incomingServerInvites.length > 9 ? '9+' : incomingServerInvites.length}</i>}</IconButton>{page === 'chat' && activeServer && <IconButton label="Invite to this space" onClick={openInvite}><UserPlus size={17} /></IconButton>}{page === 'chat' && isOwner && activeServer && <IconButton label="Review safety reports" onClick={() => openServerModal('moderation')}><Shield size={17} /></IconButton>}{page === 'chat' && isOwner && activeChannel && <IconButton label="Channel settings" onClick={() => setModal('channelSettings')}><Settings2 size={17} /></IconButton>}{page === 'chat' && activeChannel?.kind === 'text' && <IconButton label={`${pinnedMessages.length} pinned messages`} className={pinnedOpen ? 'active-soft' : ''} onClick={() => { setPinnedOpen((value) => !value); setActiveThread(null); }}><Pin size={16} /></IconButton>}{page === 'chat' && activeChannel?.kind === 'voice' && <IconButton label={voiceChannelId === activeChannel.id ? 'In voice call' : 'Join voice call'} className="quick-call" onClick={() => setVoiceChannelId(activeChannel.id)}><Phone size={16} /><span>{voiceChannelId === activeChannel.id ? 'In call' : 'Join call'}</span></IconButton>}{activeConversation && <IconButton label={dmVoiceCounts[activeConversation.id] ? 'Join private call' : 'Start private call'} className="quick-call" onClick={() => setVoiceChannelId(`dmvoice:${activeConversation.id}`)}><Phone size={16} /><span>{voiceChannelId === `dmvoice:${activeConversation.id}` ? 'In call' : dmVoiceCounts[activeConversation.id] ? 'Join call' : 'Call'}</span></IconButton>}{(page === 'dms' || activeConversation) && <IconButton label="Add a friend" onClick={() => setModal('friends')}><UserPlus size={17} /></IconButton>}<IconButton label={rightOpen ? 'Hide people panel' : 'Show people panel'} className={rightOpen ? 'active-soft' : ''} onClick={() => setRightOpen((v) => !v)}><PanelRight size={17} /></IconButton><IconButton label="Settings" onClick={() => setModal('profile')}><Settings2 size={17} /></IconButton></div>
      </header>

      {page === 'friends' ? <FriendsPage friends={filteredFriends} onlineIds={onlineIds} query={query} setQuery={setQuery} incoming={incomingRequests} outgoing={outgoingRequests} onAccept={acceptFriendRequest} onDismiss={dismissFriendRequest} onAdd={() => setModal('friends')} onMessage={(friend) => { const conversation = conversations.find((item) => !item.isGroup && item.memberIds.includes(friend.id)); if (conversation) selectConversation(conversation); else { setModal('friends'); setToast('Add this person by their CORE handle to start a private conversation.'); } }} /> : page === 'dms' && !activeConversation ? <DirectMessagesPage conversations={conversations} onlineIds={onlineIds} onSelect={selectConversation} onAdd={() => setModal('friends')} onGroup={() => setModal('groupDM')} /> : <>
        {voiceChannelId && ((activeChannel?.kind === 'voice' && activeChannel.id === voiceChannelId) || (activeConversation && voiceChannelId === `dmvoice:${activeConversation.id}`)) ? <VoiceCall key={voiceChannelId} channelId={voiceChannelId} channelName={displayName} socket={socket} user={user} onLeave={() => setVoiceChannelId(null)} /> : <div className="chat-layout">
          <section className="chat-column">
            {channelMessages.length === 0 ? <div className="chat-welcome"><div className="welcome-symbol">{activeConversation ? <Avatar user={activeConversation.otherUser} size="avatar-lg" /> : <span><Hash size={23} /></span>}</div><span className="eyebrow">{activeConversation ? activeConversation.isGroup ? 'YOUR GROUP CONVERSATION' : 'JUST BETWEEN YOU TWO' : `A FRESH START · ${activeServer?.name?.toUpperCase() || 'CORE'}`}</span><h2>{activeConversation ? activeConversation.isGroup ? activeConversation.name : `You and ${activeConversation.otherUser.name}` : `Welcome to #${activeChannel?.name || 'general'}`}</h2><p>{activeConversation ? activeConversation.isGroup ? `${activeConversation.members?.length || activeConversation.memberIds.length} people, one shared conversation.` : 'This is the beginning of something good.' : activeChannel?.topic || 'A little space to share whatever’s on your mind.'}</p>{!activeConversation && <div className="welcome-actions"><button onClick={openInvite}><UserPlus size={15} />Invite someone</button><span>or just say hello</span></div>}</div> : <div className="message-list" role="log" aria-live="polite">{channelMessages.map((message, index) => <MessageRow key={message.id} message={message} previous={channelMessages[index - 1]} assets={serverAssets} currentUserId={user.id} canManage={Boolean(activeChannel && isOwner)} focused={message.id === jumpMessageId} onReact={reactToMessage} onVote={votePoll} onEdit={editMessage} onDelete={deleteMessage} onOpenThread={openThread} onTogglePin={togglePin} onProfile={openMessageProfile} onReport={(item) => { setReportMessage(item); setModal('report'); }} />)}<div className="me…8568 tokens truncated…friend)}><MessageCircle size={15} />Message</button></div>)}</div> : <div className="friends-empty"><div className="empty-orbit"><span>✦</span></div><h2>{friends.length ? 'No one by that name.' : 'A good hello goes a long way.'}</h2><p>{friends.length ? 'Try a different name or handle.' : 'Send a friend request to someone by their CORE handle.'}</p>{!friends.length && <Button className="subtle" onClick={onAdd}><Plus size={15} />Find your people</Button>}</div>}</div>;
}
function DirectMessagesPage({ conversations, onlineIds, onSelect, onAdd, onGroup }: { conversations: Conversation[]; onlineIds: string[]; onSelect: (item: Conversation) => void; onAdd: () => void; onGroup: () => void }) {
  return <div className="dms-page"><div className="friends-head"><div><span className="eyebrow">YOUR PRIVATE CONVERSATIONS</span><h1>Messages.</h1><p>Quiet one-to-one notes and lively group chats.</p></div><div className="dm-page-actions"><Button className="subtle" onClick={onGroup}><Users size={15} />New group</Button><Button className="primary" onClick={onAdd}><Plus size={16} />Start a conversation</Button></div></div>{conversations.length ? <div className="conversation-list">{conversations.map((item) => <button key={item.id} className="conversation-card" onClick={() => onSelect(item)}><Avatar user={item.otherUser} size="avatar-lg" status={!item.isGroup} /><div><b>{item.isGroup ? item.name : item.otherUser.name}</b><small>{item.isGroup ? `${item.members?.length || item.memberIds.length} members` : `@${item.otherUser.handle}`}</small><p>{item.isGroup ? `${item.members?.map((member) => member.name).slice(0, 3).join(', ') || 'Your group'} · private group conversation` : onlineIds.includes(item.otherUser.id) ? 'Here now · ready when you are' : 'Drop a note when you like.'}</p></div><ChevronRight size={18} /></button>)}</div> : <div className="friends-empty"><div className="empty-orbit"><MessageCircle size={21} /></div><h2>Make the first move.</h2><p>Find a friend by their CORE handle, or invite a few friends to a group conversation.</p><div className="empty-actions"><Button className="subtle" onClick={onAdd}><UserPlus size={15} />Add someone</Button><Button className="primary" onClick={onGroup}><Users size={15} />Start a group</Button></div></div>}</div>;
}

function ProfileModal({ user, onClose, onSave, onImage, onLogout }: { user: User; onClose: () => void; onSave: (values: { name: string; bio: string; status: Status; theme: User['theme'] }) => Promise<void>; onImage: (type: 'avatar' | 'banner', data: string) => Promise<void>; onLogout: () => void }) {
  const [name, setName] = useState(user.name); const [bio, setBio] = useState(user.bio || ''); const [status, setStatus] = useState<Status>(user.status); const [theme, setTheme] = useState<User['theme']>(user.theme); const [crop, setCrop] = useState<'avatar' | 'banner' | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setPending(true); setError(''); try { await onSave({ name, bio, status, theme }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t save your profile.'); } finally { setPending(false); } };
  return <>{crop && <ImageCropper title={crop === 'avatar' ? 'Profile photo' : 'Profile banner'} aspect={crop === 'avatar' ? 1 : 2.6} shape={crop === 'avatar' ? 'circle' : 'banner'} onClose={() => setCrop(null)} onSave={(data) => onImage(crop, data)} />}<Modal title="Your little corner." kicker="PROFILE & SETTINGS" onClose={onClose} className="profile-modal"><div className="profile-preview"><div className="profile-preview-banner">{user.banner && <img src={assetUrl(user.banner)} alt="" />}</div><button className="profile-edit-avatar" aria-label="Change profile photo" onClick={() => setCrop('avatar')}><Avatar user={user} size="avatar-profile" status /><span><ImagePlus size={13} /></span></button><button className="banner-edit" onClick={() => setCrop('banner')}><ImagePlus size={13} />Change banner</button></div><div className="profile-fields"><label>Display name<input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /></label><label>CORE handle<div className="read-only-field"><AtSign size={14} />{user.handle}<small>Can’t be changed</small></div></label><label>A little about you<textarea value={bio} maxLength={120} rows={2} onChange={(e) => setBio(e.target.value)} placeholder="The things you like, what you’re up to…" /></label><div className="settings-field"><span>Your presence</span><div className="status-options">{(['online', 'idle', 'dnd', 'invisible'] as Status[]).map((item) => <button key={item} className={status === item ? 'selected' : ''} onClick={() => setStatus(item)}><i className={`presence-dot ${item}`} />{item === 'dnd' ? 'Busy' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div><div className="settings-field"><span>App mood</span><div className="theme-options">{(Object.keys(palette) as Array<keyof typeof palette>).map((item) => <button key={item} aria-label={`${item} theme`} title={`${item} theme`} className={theme === item ? 'selected' : ''} style={{ '--swatch': palette[item] } as CSSProperties} onClick={() => setTheme(item)}><i />{item}</button>)}</div></div>{error && <p className="form-error">{error}</p>}</div><div className="modal-actions profile-actions"><button className="button danger-quiet" onClick={onLogout}><LogOut size={15} />Sign out</button><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Save changes'}</Button></div></Modal></>;
}

function ServerModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, images?: { icon?: string; banner?: string }) => Promise<void> }) {
  const [name, setName] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [crop, setCrop] = useState<'icon' | 'banner' | null>(null); const [images, setImages] = useState<{ icon?: string; banner?: string }>({});
  return <>{crop && <ImageCropper title={crop === 'icon' ? 'Space icon' : 'Space banner'} aspect={crop === 'icon' ? 1 : 2.6} shape={crop === 'icon' ? 'circle' : 'banner'} onClose={() => setCrop(null)} onSave={async (data) => setImages((value) => ({ ...value, [crop]: data }))} />}<Modal title="Make a little space." kicker="START SOMETHING" onClose={onClose}><div className="server-create-art"><div className="create-mark"><BrandMark /></div><div><h3>Gather your people.</h3><p>A place for your favourite conversations to find each other.</p></div></div><label className="modal-label">Space name<input autoFocus value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="The little things club" /></label><div className="create-server-images"><button onClick={() => setCrop('icon')}><span className="server-icon-preview">{images.icon ? <img src={images.icon} alt="" /> : <ImagePlus size={16} />}</span><b>Icon</b><small>{images.icon ? 'Image ready' : 'Add an image'}</small></button><button onClick={() => setCrop('banner')}><span className="server-banner-preview">{images.banner ? <img src={images.banner} alt="" /> : <ImagePlus size={16} />}</span><b>Banner</b><small>{images.banner ? 'Image ready' : 'Add an image'}</small></button></div><div className="private-note"><Shield size={15} /><span>Your space is private. People join by invite.</span></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!name.trim() || pending} onClick={async () => { setPending(true); try { await onCreate(name.trim(), images); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t create this space.'); setPending(false); } }}>{pending ? 'Creating…' : 'Create space'}<ChevronRight size={15} /></Button></div></Modal></>;
}
function ServerSettingsModal({ server, onClose, onSave, onImages }: { server: Server; onClose: () => void; onSave: (serverId: string, values: { name: string; description: string }) => Promise<void>; onImages: () => void }) {
  const [name, setName] = useState(server.name); const [description, setDescription] = useState(server.description || ''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setPending(true); setError(''); try { await onSave(server.id, { name: name.trim(), description: description.trim() }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t save space settings.'); } finally { setPending(false); } };
  return <Modal title="Shape your space." kicker="SPACE SETTINGS" onClose={onClose} className="server-settings-modal"><div className="server-settings-hero" style={server.banner ? { backgroundImage: `linear-gradient(90deg,rgba(12,14,20,.87),rgba(12,14,20,.16)),url(${assetUrl(server.banner)})` } : undefined}><span className="server-settings-icon">{server.icon ? <img src={assetUrl(server.icon)} alt="" /> : initials(server.name)}</span><span><b>{server.name}</b><small>Everyone here belongs.</small></span><button className="button subtle small" onClick={onImages}><ImagePlus size={14} />Artwork</button></div><label className="modal-label">Space name<input autoFocus value={name} maxLength={48} onChange={(event) => setName(event.target.value)} /></label><label className="modal-label server-description-field">Description<textarea value={description} maxLength={240} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="What brings your people together?" /></label><small className="field-counter">{description.length}/240</small>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={pending || name.trim().length < 2} onClick={submit}>{pending ? 'Saving…' : 'Save changes'}</Button></div></Modal>;
}

function ChannelModal({ server, channel, onClose, onCreate, onSave }: { server: Server; channel?: Channel; onClose: () => void; onCreate?: (values: Omit<Channel, 'id' | 'serverId' | 'position'>) => Promise<void>; onSave?: (channelId: string, values: Omit<Channel, 'id' | 'serverId' | 'position' | 'kind'>) => Promise<void> }) {
  const [name, setName] = useState(channel?.name || ''); const [kind, setKind] = useState<'text' | 'voice'>(channel?.kind || 'text'); const [topic, setTopic] = useState(channel?.topic || ''); const [category, setCategory] = useState(channel?.category || 'THE LOUNGE'); const [slowModeSeconds, setSlowModeSeconds] = useState(channel?.slowModeSeconds || 0); const [isPrivate, setIsPrivate] = useState(channel?.private || false); const [allowedUserIds, setAllowedUserIds] = useState<string[]>(channel?.allowedUserIds || []); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const toggleMember = (userId: string) => setAllowedUserIds((current) => current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]);
  const submit = async () => {
    setPending(true); setError('');
    try {
      const values = { name: name.trim(), kind, topic: topic.trim(), category: category.trim(), slowModeSeconds: kind === 'text' ? slowModeSeconds : 0, private: isPrivate, allowedUserIds: isPrivate ? allowedUserIds : [] };
      if (channel && onSave) await onSave(channel.id, values);
      else if (onCreate) await onCreate(values);
    } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t save channel settings.'); setPending(false); }
  };
  return <Modal title={channel ? `Tune #${channel.name}.` : 'Give it a name.'} kicker={channel ? 'CHANNEL SETTINGS' : 'NEW CHANNEL'} onClose={onClose} className="channel-modal"><div className="channel-kind-select"><button disabled={Boolean(channel)} className={kind === 'text' ? 'selected' : ''} onClick={() => setKind('text')}><Hash size={17} /><span><b>Text</b><small>Messages, links and little updates.</small></span><i /></button><button disabled={Boolean(channel)} className={kind === 'voice' ? 'selected' : ''} onClick={() => setKind('voice')}><Volume2 size={17} /><span><b>Voice</b><small>Drop in for a real-time conversation.</small></span><i /></button></div><div className="channel-settings-grid"><label className="modal-label">Channel name<input autoFocus value={name} maxLength={48} onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, ''))} placeholder={kind === 'text' ? 'book-club' : 'coffee-break'} /></label><label className="modal-label">Category<input value={category} maxLength={32} onChange={(event) => setCategory(event.target.value)} placeholder="THE LOUNGE" /></label></div><label className="modal-label">Topic or description<textarea value={topic} maxLength={120} rows={2} onChange={(event) => setTopic(event.target.value)} placeholder="What should people know about this space?" /></label><div className="channel-settings-grid"><label className="modal-label">Slow mode<select disabled={kind === 'voice'} value={slowModeSeconds} onChange={(event) => setSlowModeSeconds(Number(event.target.value))}><option value={0}>Off</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={300}>5 minutes</option></select></label><div className="channel-privacy-control"><span>Private channel</span><button type="button" className={`switch ${isPrivate ? 'on' : ''}`} role="switch" aria-checked={isPrivate} onClick={() => setIsPrivate((value) => !value)}><i /></button></div></div>{isPrivate && <div className="channel-access-list"><div><b>Who can see this?</b><small>Owners and admins always have access.</small></div>{(server.members || []).map((member) => <label key={member.userId}><input type="checkbox" checked={allowedUserIds.includes(member.userId)} onChange={() => toggleMember(member.userId)} /><Avatar user={member.user} /><span>{member.user.name}</span><small>{member.role}</small></label>)}</div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!name.trim() || pending} onClick={() => void submit()}>{pending ? 'Saving…' : channel ? 'Save channel' : 'Create channel'}<MoveRight size={15} /></Button></div></Modal>;
}

function InviteModalLegacy({ server, onClose, onToast }: { server: Server; onClose: () => void; onToast: (v: string) => void }) {
  const [invite, setInvite] = useState<Invite | null>(null); const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [hours, setHours] = useState(24); const [error, setError] = useState('');
  const create = async () => { setLoading(true); setError(''); try { const result = await api<{ invite: Invite; url: string }>(`/api/servers/${server.id}/invites`, { method: 'POST', body: JSON.stringify({ expiryHours: hours }) }); setInvite(result.invite); setUrl(result.url); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t create the invite.'); } finally { setLoading(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); onToast('Invite copied. Send it to your people.'); } catch { onToast(url); } };
  const share = async () => { try { await navigator.share({ title: `Join ${server.name} on CORE`, text: 'Come join our space.', url }); } catch { await copy(); } };
  return <Modal title={`Bring someone to ${server.name}.`} kicker="A LITTLE INVITE" onClose={onClose}><div className="invite-intro"><span className="invite-icon"><UserPlus size={20} /></span><p>Send a link to anyone you’d like in this space. They’ll need a CORE account to join.</p></div>{invite ? <div className="invite-result"><span className="invite-link-label">YOUR INVITE LINK</span><div className="invite-link-row"><input readOnly value={url} aria-label="Invite link" /><button onClick={copy} aria-label="Copy invite"><Copy size={16} /></button><button onClick={share} aria-label="Share invite"><Share2 size={16} /></button></div><span className="invite-expiry"><span className="live-dot" />Expires {(invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'Never expires')}</span><Button className="subtle wide" onClick={() => { setInvite(null); setUrl(''); }}>Create another invite</Button></div> : <><label className="modal-label">This link expires<select value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>In 1 hour</option><option value={24}>In 24 hours</option><option value={168}>In 7 days</option><option value={720}>In 30 days</option></select></label><div className="invite-safety"><Shield size={14} />You can revoke an invite at any time from the space settings.</div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Not now</Button><Button className="primary" disabled={loading} onClick={create}>{loading ? 'Preparing link…' : 'Create invite link'}<ChevronRight size={15} /></Button></div></>}</Modal>;
}

function UserProfileModal({ user, online, onClose }: { user: User; online: boolean; onClose: () => void }) {
  return <Modal title="A little about them." kicker="PROFILE" onClose={onClose} className="user-profile-modal"><div className="user-profile-banner" style={user.banner ? { backgroundImage: `linear-gradient(180deg,rgba(10,11,14,.04),rgba(10,11,14,.42)),url(${assetUrl(user.banner)})` } : undefined}><span className="user-profile-spark"><Sparkles size={15} /></span></div><div className="user-profile-identity"><Avatar user={{ ...user, status: online ? 'online' : user.status }} size="avatar-profile" status /><div><h3>{user.name}</h3><span>@{user.handle}</span></div><small className={`profile-presence ${online ? 'online' : ''}`}><i />{online ? 'Online now' : 'Away'}</small></div><p className="user-profile-bio">{user.bio || 'Finding their people, one conversation at a time.'}</p><div className="user-profile-footer"><span><span className="profile-brand-dot" />CORE member</span><span>Here since {new Date().getFullYear()}</span></div><div className="modal-actions"><div className="action-spacer" /><Button className="primary" onClick={onClose}>Done</Button></div></Modal>;
}

function ServerInvitationsModal({ invitations, onClose, onAccept, onDecline }: { invitations: ServerInvitation[]; onClose: () => void; onAccept: (invitation: ServerInvitation) => Promise<void>; onDecline: (invitation: ServerInvitation) => Promise<void> }) {
  const [busyId, setBusyId] = useState(''); const [error, setError] = useState('');
  const respond = async (invitation: ServerInvitation, action: 'accept' | 'decline') => {
    setBusyId(invitation.id); setError('');
    try { await (action === 'accept' ? onAccept(invitation) : onDecline(invitation)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t update that invitation.'); }
    finally { setBusyId(''); }
  };
  return <Modal title="Your invitations." kicker="A FRIEND SAVED YOU A SEAT" onClose={onClose} className="server-invitations-modal">{invitations.length ? <div className="server-invitation-list">{invitations.map((invitation) => <article className="server-invitation-card" key={invitation.id}><div className="server-invitation-art" style={invitation.server.banner ? { backgroundImage: `linear-gradient(180deg,rgba(12,13,16,.1),rgba(12,13,16,.62)),url(${assetUrl(invitation.server.banner)})` } : undefined}><span>{invitation.server.icon ? <img src={assetUrl(invitation.server.icon)} alt="" /> : initials(invitation.server.name)}</span></div><div className="server-invitation-copy"><span className="eyebrow">SPACE INVITATION</span><h3>{invitation.server.name}</h3><p><b>{invitation.inviter.name}</b> invited you to join their space.</p><small>{invitation.expiresAt ? `Invitation expires ${new Date(invitation.expiresAt).toLocaleString()}` : 'This invitation doesn’t expire'}</small></div><div className="server-invitation-actions"><Button className="subtle small" disabled={busyId === invitation.id} onClick={() => void respond(invitation, 'decline')}>Decline</Button><Button className="primary small" disabled={busyId === invitation.id} onClick={() => void respond(invitation, 'accept')}>{busyId === invitation.id ? 'Joining…' : 'Join space'}<ChevronRight size={14} /></Button></div></article>)}</div> : <div className="server-invitations-empty"><span><Bell size={20} /></span><b>All caught up.</b><p>When a friend invites you to one of their spaces, it’ll show up here.</p></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Close</Button></div></Modal>;
}

function InviteModal({ server, friends, onClose, onToast, onInviteFriends }: { server: Server; friends: User[]; onClose: () => void; onToast: (v: string) => void; onInviteFriends: (serverId: string, friendIds: string[], expiryHours: number) => Promise<void> }) {
  const [mode, setMode] = useState<'link' | 'friends'>('link'); const [invite, setInvite] = useState<Invite | null>(null); const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false); const [hours, setHours] = useState(24); const [maxUses, setMaxUses] = useState<number | null>(null); const [selected, setSelected] = useState<string[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState('');
  const visibleFriends = friends.filter((friend) => `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase()));
  const create = async () => { setLoading(true); setError(''); try { const result = await api<{ invite: Invite; url: string }>(`/api/servers/${server.id}/invites`, { method: 'POST', body: JSON.stringify({ expiryHours: hours, maxUses }) }); setInvite(result.invite); setUrl(result.url); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t create the invite.'); } finally { setLoading(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); onToast('Invite copied. Send it to your people.'); } catch { onToast(url); } };
  const share = async () => { try { await navigator.share({ title: `Join ${server.name} on CORE`, text: 'Come join our space.', url }); } catch { await copy(); } };
  const sendFriends = async () => { setLoading(true); setError(''); try { await onInviteFriends(server.id, selected, hours); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t send those invitations.'); } finally { setLoading(false); } };
  const toggleFriend = (friendId: string) => setSelected((current) => current.includes(friendId) ? current.filter((item) => item !== friendId) : [...current, friendId]);
  const expiryLabel = invite?.expiresAt ? `Expires ${(invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'Never expires')}` : 'Never expires';
  return <Modal title={`Bring someone to ${server.name}.`} kicker="SPACE INVITES" onClose={onClose} className="invite-modal"><div className="invite-mode-switch" role="tablist" aria-label="Choose how to invite"><button type="button" role="tab" aria-selected={mode === 'link'} className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}><Share2 size={14} />Invite link</button><button type="button" role="tab" aria-selected={mode === 'friends'} className={mode === 'friends' ? 'active' : ''} onClick={() => setMode('friends')}><Users size={14} />Your friends{friends.length > 0 && <small>{friends.length}</small>}</button></div><div className="invite-intro"><span className="invite-icon"><UserPlus size={19} /></span><p>{mode === 'link' ? 'Make a link you can share anywhere. Choose how long it lasts and how many people can use it.' : 'Pick friends from your CORE circle and send them a private invitation to this space.'}</p></div>{mode === 'link' && invite ? <div className="invite-result"><span className="invite-link-label">YOUR 8-CHARACTER INVITE CODE</span><div className="invite-code-pill"><span>{invite.id}</span><small>{invite.uses || 0}{invite.maxUses ? ` / ${invite.maxUses}` : ''} uses</small></div><div className="invite-link-row"><input readOnly value={url} aria-label="Invite link" /><button onClick={copy} aria-label="Copy invite" title="Copy invite"><Copy size={16} /></button><button onClick={share} aria-label="Share invite" title="Share invite"><Share2 size={16} /></button></div><span className="invite-expiry"><span className="live-dot" />{expiryLabel}</span><Button className="subtle wide" onClick={() => { setInvite(null); setUrl(''); }}>Create another link</Button></div> : mode === 'link' ? <><div className="invite-settings-grid"><label className="modal-label">Link expires<select value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={1}>After 1 hour</option><option value={24}>After 1 day</option><option value={168}>After 7 days</option><option value={720}>After 30 days</option><option value={0}>Never</option></select></label><label className="modal-label">Max uses<select value={maxUses ?? 'unlimited'} onChange={(event) => setMaxUses(event.target.value === 'unlimited' ? null : Number(event.target.value))}><option value="unlimited">No limit</option><option value={1}>1 use</option><option value={5}>5 uses</option><option value={10}>10 uses</option><option value={25}>25 uses</option><option value={100}>100 uses</option></select></label></div><div className="invite-safety"><Shield size={14} /><span>Links use a random code. You can revoke them from space settings.</span></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Not now</Button><Button className="primary" disabled={loading} onClick={() => void create()}>{loading ? 'Preparing link…' : 'Create invite link'}<ChevronRight size={15} /></Button></div></> : <><div className="invite-friend-toolbar"><div><b>Your circle</b><small>{selected.length} selected</small></div><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a friend" /></label></div>{friends.length ? <div className="invite-friend-list">{visibleFriends.map((friend) => <button type="button" key={friend.id} className={`invite-friend-row ${selected.includes(friend.id) ? 'selected' : ''}`} aria-pressed={selected.includes(friend.id)} onClick={() => toggleFriend(friend.id)}><Avatar user={friend} status /><span><b>{friend.name}</b><small>@{friend.handle}</small></span><i>{selected.includes(friend.id) && <Check size={13} />}</i></button>)}</div> : <div className="invite-friends-empty"><Users size={19} /><b>Your circle is still growing.</b><span>Add friends to CORE first, then invite them here.</span></div>}<label className="modal-label invite-direct-expiry">Invitation expires<select value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={1}>After 1 hour</option><option value={24}>After 1 day</option><option value={168}>After 7 days</option><option value={720}>After 30 days</option><option value={0}>Never</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!selected.length || loading} onClick={() => void sendFriends()}>{loading ? 'Sending…' : `Send ${selected.length || ''} invite${selected.length === 1 ? '' : 's'}`}<Send size={14} /></Button></div></>}</Modal>;
}

function FriendModal({ onClose, onAdd }: { onClose: () => void; onAdd: (handle: string) => Promise<void> }) {
  const [handle, setHandle] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  return <Modal title="Find your people." kicker="ADD A FRIEND" onClose={onClose}><div className="friend-add-card"><span><UserPlus size={20} /></span><p>Search for someone by their CORE handle. They’ll receive a request, and you can chat once they accept.</p></div><label className="modal-label">Their CORE handle<div className="input-handle modal-handle"><AtSign size={16} /><input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }} placeholder="theirname" /></div></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!handle.trim() || pending} onClick={async () => { setPending(true); setError(''); try { await onAdd(handle.trim()); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t find that person.'); } finally { setPending(false); } }}>{pending ? 'Sending…' : 'Send request'}<MoveRight size={15} /></Button></div></Modal>;
}

function GroupDMModal({ friends, onClose, onCreate }: { friends: User[]; onClose: () => void; onCreate: (memberIds: string[], name: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]); const [name, setName] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const toggle = (userId: string) => setSelected((current) => current.includes(userId) ? current.filter((id) => id !== userId) : current.length < 9 ? [...current, userId] : current);
  return <Modal title="Bring everyone together." kicker="NEW GROUP MESSAGE" onClose={onClose} className="group-dm-modal"><p className="group-dm-intro">Choose two or more friends. Everyone in the group can rename it and start a voice call.</p><label className="modal-label">Group name <span className="optional-label">optional</span><input autoFocus value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="Friday plans, the book club…" /></label><div className="group-dm-count">Friends <span>{selected.length} / 9 selected</span></div><div className="group-dm-friends">{friends.length ? friends.map((friend) => <button key={friend.id} className={`group-friend ${selected.includes(friend.id) ? 'selected' : ''}`} onClick={() => toggle(friend.id)} aria-pressed={selected.includes(friend.id)}><Avatar user={friend} status /><span><b>{friend.name}</b><small>@{friend.handle}</small></span><i>{selected.includes(friend.id) && <Check size={13} />}</i></button>) : <div className="group-dm-empty"><Users size={20} /><b>Your circle is still growing.</b><span>Add at least two friends before starting a group.</span></div>}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={pending || selected.length < 2} onClick={async () => { setPending(true); setError(''); try { await onCreate(selected, name.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t create the group.'); setPending(false); } }}>{pending ? 'Starting…' : `Start group${selected.length ? ` · ${selected.length + 1} people` : ''}`}<MoveRight size={15} /></Button></div></Modal>;
}

function PollModal({ onClose, onCreate }: { onClose: () => void; onCreate: (question: string, options: string[]) => Promise<void> }) {
  const [question, setQuestion] = useState(''); const [options, setOptions] = useState(['', '']); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const updateOption = (index: number, value: string) => setOptions((current) => current.map((option, item) => item === index ? value : option));
  return <Modal title="Ask your people." kicker="A QUICK POLL" onClose={onClose} className="poll-modal"><p className="group-dm-intro">Create a simple poll. Everyone in the conversation can vote and change their answer.</p><label className="modal-label">Question<input autoFocus value={question} maxLength={180} onChange={(event) => setQuestion(event.target.value)} placeholder="Where should we meet?" /></label><div className="poll-builder-heading">Options <small>{options.length} / 6</small></div><div className="poll-builder-options">{options.map((option, index) => <div className="poll-builder-option" key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} maxLength={80} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Option ${index + 1}`} aria-label={`Poll option ${index + 1}`} />{options.length > 2 && <button aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, item) => item !== index))}><X size={14} /></button>}</div>)}</div>{options.length < 6 && <button className="poll-add-option" onClick={() => setOptions((current) => [...current, ''])}><Plus size={14} />Add another option</button>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={pending || question.trim().length < 4 || options.some((option) => !option.trim())} onClick={async () => { setPending(true); setError(''); try { await onCreate(question.trim(), options.map((option) => option.trim())); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t create this poll.'); setPending(false); } }}>{pending ? 'Creating…' : 'Share poll'}<MoveRight size={15} /></Button></div></Modal>;
}

type ModerationReport = { id: string; reason: string; details: string; status: 'open' | 'resolved' | 'dismissed'; createdAt: string; reporter: User | null; reportedUser: User | null; message: { id: string; text: string } | null; channel: string };
type CommunityEvent = { id: string; title: string; description: string; startsAt: string; channelId: string | null; locationName: string; attendeeCount: number; attending: boolean; createdByUser: User | null };
function EventsModal({ server, isOwner, socket, onClose, onToast }: { server: Server; isOwner: boolean; socket: Socket | null; onClose: () => void; onToast: (message: string) => void }) {
  const [events, setEvents] = useState<CommunityEvent[]>([]); const [loading, setLoading] = useState(true); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [startsAt, setStartsAt] = useState(() => { const date = new Date(Date.now() + 2 * 3600000); date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }); const [channelId, setChannelId] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const refresh = () => { setLoading(true); api<{ events: CommunityEvent[] }>(`/api/servers/${server.id}/events`).then(({ events: list }) => setEvents(list)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Couldn’t load events.')).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); const updated = ({ serverId }: { serverId: string }) => { if (serverId === server.id) refresh(); }; socket?.on('community:event-updated', updated); return () => { socket?.off('community:event-updated', updated); }; }, [server.id, socket]);
  const create = async () => { setPending(true); setError(''); try { const startsAtIso = new Date(startsAt).toISOString(); await api(`/api/servers/${server.id}/events`, { method: 'POST', body: JSON.stringify({ title: title.trim(), description: description.trim(), startsAt: startsAtIso, channelId: channelId || null }) }); setTitle(''); setDescription(''); onToast('Your get-together is on the calendar.'); refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t schedule this event.'); } finally { setPending(false); } };
  const rsvp = async (item: CommunityEvent) => { try { const updated = await api<{ attending: boolean; attendeeCount: number }>(`/api/events/${item.id}/rsvp`, { method: 'PUT', body: JSON.stringify({ attending: !item.attending }) }); setEvents((current) => current.map((event) => event.id === item.id ? { ...event, ...updated } : event)); } catch (cause) { onToast(cause instanceof Error ? cause.message : 'Couldn’t update your RSVP.'); } };
  const cancel = async (item: CommunityEvent) => { if (!window.confirm(`Cancel “${item.title}”?`)) return; try { await api(`/api/events/${item.id}`, { method: 'DELETE' }); setEvents((current) => current.filter((event) => event.id !== item.id)); onToast('Event canceled.'); } catch (cause) { onToast(cause instanceof Error ? cause.message : 'Couldn’t cancel this event.'); } };
  return <Modal title="Make a date with your people." kicker="UPCOMING EVENTS" onClose={onClose} className="events-modal"><div className="events-space-heading"><span><CalendarDays size={17} /></span><div><b>{server.name}</b><small>Little plans become lovely memories.</small></div><button className="icon-button" title="Refresh events" onClick={refresh}><Activity size={15} /></button></div>{isOwner && <section className="event-create"><div className="event-create-title"><b>Plan something</b><small>Invite the whole space</small></div><label className="modal-label">Event name<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Movie night, game session…" /></label><div className="event-form-grid"><label className="modal-label">When<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="modal-label">Meet in<select value={channelId} onChange={(event) => setChannelId(event.target.value)}><option value="">A little get-together</option>{server.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.kind === 'voice' ? 'Voice · ' : '#'}{channel.name}</option>)}</select></label></div><label className="modal-label">A note for everyone <span className="optional-label">optional</span><textarea value={description} maxLength={500} rows={2} onChange={(event) => setDescription(event.target.value)} placeholder="Share the details, if there are any." /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary event-create-button" disabled={pending || title.trim().length < 3 || !startsAt} onClick={() => void create()}>{pending ? 'Saving…' : 'Add to the calendar'}<MoveRight size={14} /></button></section>}<div className="event-list-heading"><b>Coming up</b><button onClick={refresh}><Activity size={13} />Refresh</button></div>{loading ? <div className="events-empty"><Waves size={18} />Looking for good plans…</div> : events.length ? <div className="event-cards">{events.map((item) => <article className="event-card" key={item.id}><div className="event-date"><b>{new Date(item.startsAt).toLocaleDateString(undefined, { day: '2-digit' })}</b><small>{new Date(item.startsAt).toLocaleDateString(undefined, { month: 'short' })}</small></div><div className="event-copy"><h3>{item.title}</h3><p>{item.description || 'A little time together.'}</p><small><CalendarDays size={12} />{new Date(item.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<i />{item.locationName} · {item.attendeeCount} going</small></div><div className="event-actions"><button className={`button small ${item.attending ? 'subtle' : 'primary'}`} aria-pressed={item.attending} onClick={() => void rsvp(item)}>{item.attending ? 'Going ✓' : 'I’m in'}</button>{isOwner && <button className="event-cancel" onClick={() => void cancel(item)}>Cancel</button>}</div></article>)}</div> : <div className="events-empty"><CalendarDays size={19} /><b>No plans on the calendar.</b><span>{isOwner ? 'Start with something small. Invite your people.' : 'Ask a space admin to plan a get-together.'}</span></div>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Close</Button></div></Modal>;
}

function ReportModal({ message, onClose, onSubmit }: { message: Message; onClose: () => void; onSubmit: (message: Message, reason: string, details: string) => Promise<void> }) {
  const [reason, setReason] = useState('harassment'); const [details, setDetails] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setPending(true); setError(''); try { await onSubmit(message, reason, details.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t send your report.'); } finally { setPending(false); } };
  return <Modal title="Let the space team know." kicker="REPORT MESSAGE" onClose={onClose} className="report-modal"><div className="report-quote"><b>{message.author}</b><p>{message.text || 'This message contains an attachment.'}</p></div><label className="modal-label">What’s going on?<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="harassment">Harassment or bullying</option><option value="spam">Spam or unwanted promotion</option><option value="unsafe">Unsafe or harmful content</option><option value="impersonation">Impersonation</option><option value="other">Something else</option></select></label><label className="modal-label">Anything else we should know? <span className="optional-label">optional</span><textarea value={details} maxLength={500} rows={3} onChange={(event) => setDetails(event.target.value)} placeholder="Share a little context for the moderators." /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="report-privacy"><LockKeyhole size={14} />Only this space’s moderators can see your report.</div><div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={pending} onClick={() => void submit()}>{pending ? 'Sending…' : 'Send report'}<Flag size={14} /></Button></div></Modal>;
}

function ModerationModal({ server, onClose, onToast }: { server: Server; onClose: () => void; onToast: (message: string) => void }) {
  const [reports, setReports] = useState<ModerationReport[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [filter, setFilter] = useState<'open' | 'all'>('open');
  const refresh = () => { setLoading(true); api<{ reports: ModerationReport[] }>(`/api/servers/${server.id}/reports`).then(({ reports: list }) => setReports(list)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Couldn’t load reports.')).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); }, [server.id]);
  const update = async (report: ModerationReport, status: 'resolved' | 'dismissed') => { try { await api(`/api/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item)); onToast(status === 'resolved' ? 'Report marked handled.' : 'Report dismissed.'); } catch (cause) { onToast(cause instanceof Error ? cause.message : 'Couldn’t update this report.'); } };
  const visible = reports.filter((report) => filter === 'all' || report.status === 'open');
  return <Modal title="Keep this space kind." kicker="MODERATION QUEUE" onClose={onClose} className="moderation-modal"><div className="moderation-intro"><span><Shield size={18} /></span><p>Reports sent by members of <b>{server.name}</b>. Review each one and mark it handled or dismiss it.</p></div><div className="moderation-tabs"><button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Needs review <small>{reports.filter((item) => item.status === 'open').length}</small></button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All reports</button><button className="moderation-refresh" onClick={refresh}><Activity size={14} />Refresh</button></div>{error && <p className="form-error" role="alert">{error}</p>}{loading ? <div className="moderation-empty"><Waves size={18} />Gathering reports…</div> : visible.length ? <div className="moderation-list">{visible.map((report) => <article className="moderation-card" key={report.id}><div className="moderation-card-head"><span className={`report-status ${report.status}`}>{report.status === 'open' ? 'Needs review' : report.status}</span><time>{timeLabel(report.createdAt)}</time></div><div className="moderation-identities"><b>{report.reportedUser?.name || 'Former member'}</b><span>reported by {report.reporter?.name || 'Former member'}</span></div><p className="moderation-reason">{report.reason.replace('-', ' ')} · #{report.channel}</p><blockquote>{report.message?.text || 'The reported message has since been removed.'}</blockquote>{report.details && <p className="moderation-details">“{report.details}”</p>}{report.status === 'open' && <div className="moderation-actions"><button className="dismiss" onClick={() => void update(report, 'dismissed')}>Dismiss</button><button className="resolve" onClick={() => void update(report, 'resolved')}><Check size={13} />Mark handled</button></div>}</article>)}</div> : <div className="moderation-empty"><Shield size={19} /><b>{filter === 'open' ? 'All clear for now.' : 'No reports yet.'}</b><span>We’ll keep this corner tidy together.</span></div>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Done</Button></div></Modal>;
}

function MembersModal({ server, isOwner, userId, onlineIds, onClose, onToast, onRefresh }: { server: Server; isOwner: boolean; userId: string; onlineIds: string[]; onClose: () => void; onToast: (v: string) => void; onRefresh: () => Promise<void> }) {
  const [invites, setInvites] = useState<Invite[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { api<{ invites: Invite[] }>(`/api/servers/${server.id}`).then(({ invites }) => setInvites(invites)).catch(() => {}); }, [server.id]);
  const setRole = async (member: Member, role: 'admin' | 'member') => { setLoading(true); try { await api(`/api/servers/${server.id}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }); await onRefresh(); onToast(`${member.user.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`); } catch (error) { onToast(error instanceof Error ? error.message : 'Couldn’t update that role.'); } finally { setLoading(false); } };
  const revoke = async (invite: Invite) => { if (!window.confirm('Revoke this invite? Anyone who has the link will no longer be able to use it.')) return; try { await api(`/api/servers/${server.id}/invites/${invite.id}`, { method: 'DELETE' }); setInvites((current) => current.filter((item) => item.id !== invite.id)); onToast('Invite revoked.'); } catch { onToast('Couldn’t revoke this invite.'); } };
  return <Modal title={`${server.name} people`} kicker="YOUR SPACE" onClose={onClose} className="members-modal"><div className="members-manage-toolbar"><div><span className="live-dot" />{server.members?.length || 0} people</div><Button className="subtle small" onClick={async () => { const result = await api<{ url: string }>(`/api/servers/${server.id}/invites`, { method: 'POST', body: JSON.stringify({ expiryHours: 24 }) }); await navigator.clipboard.writeText(result.url); setInvites((current) => [...current, { id: result.url.split('invite=')[1], serverId: server.id, createdAt: Date.now(), expiresAt: Date.now() + 86400000, maxUses: null, uses: 0, revokedAt: null }]); onToast('Fresh invite link copied.'); }}><Plus size={14} />Invite</Button></div><div className="members-modal-list">{server.members?.map((member) => <div className="member-manage-row" key={member.userId}><Avatar user={member.user} status /><span><b>{member.user.name}{member.userId === userId && <small className="you-tag">you</small>}</b><small>@{member.user.handle}</small></span><span className={`role-badge ${member.role}`}>{member.role === 'owner' && <Crown size={12} />}{member.role}</span>{isOwner && member.role !== 'owner' && member.userId !== userId && <div className="role-select"><button disabled={loading} onClick={() => setRole(member, member.role === 'admin' ? 'member' : 'admin')}>{member.role === 'admin' ? 'Make member' : 'Make admin'}</button></div>}</div>)}</div>{isOwner && invites.length > 0 && <div className="invite-management"><div className="invite-management-title"><span>ACTIVE INVITES</span><small>Revoke a link any time</small></div>{invites.map((invite) => <div key={invite.id} className="invite-manage-row"><div><code>{invite.id}</code><small>{invite.uses || 0}{invite.maxUses ? ` / ${invite.maxUses}` : ''} uses · {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'Never expires'}</small></div><button onClick={() => revoke(invite)}>Revoke</button></div>)}</div>}<div className="modal-actions"><div className="action-spacer" /><Button className="primary" onClick={onClose}>Done</Button></div></Modal>;
}

function manageRole(member: Member, server: Server | null, setServers: (value: (current: Server[]) => Server[]) => void, setToast: (v: string) => void) { if (!server || member.role === 'owner') return; const role = member.role === 'admin' ? 'member' : 'admin'; api(`/api/servers/${server.id}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }).then(() => { setServers((current) => current.map((item) => item.id === server.id ? { ...item, members: item.members.map((person) => person.userId === member.userId ? { ...person, role } : person) } : item)); setToast(`${member.user.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`); }).catch((error) => setToast(error.message)); }

function Soundboard({ assets, onClose, onManage }: { assets: Array<{ id: string; name: string; url: string }>; onClose: () => void; onManage: () => void }) {
  const sounds = [{ name: 'Chime', freq: 660 }, { name: 'Soft bell', freq: 520 }, { name: 'Tiny applause', freq: 820 }, { name: 'Bubble', freq: 440 }];
  const playTone = (freq: number) => { try { const context = new AudioContext(); const osc = context.createOscillator(); const gain = context.createGain(); osc.type = 'sine'; osc.frequency.value = freq; gain.gain.setValueAtTime(.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(.08, context.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .32); osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime + .34); osc.onended = () => context.close(); } catch { } };
  const playFile = (url: string) => { const audio = new Audio(assetUrl(url)); audio.volume = .7; void audio.play().catch(() => {}); };
  return <div className="composer-popover sound-popover"><span className="popover-title">A little sound</span>{sounds.map((sound) => <button key={sound.name} className="sound-row" onClick={() => playTone(sound.freq)}><span><AudioLines size={15} /></span><b>{sound.name}</b><span className="sound-play"><Volume2 size={15} /></span></button>)}{assets.map((asset) => <button key={asset.id} className="sound-row" onClick={() => playFile(asset.url)}><span><AudioLines size={15} /></span><b>{asset.name}</b><span className="sound-play"><Volume2 size={15} /></span></button>)}<button className="sound-manage" onClick={onManage}><Plus size={12} />Add community sounds</button><small className="sound-footnote">Built into CORE · shared with your space</small><button className="sound-pop-close" aria-label="Close soundboard" onClick={onClose}><X size={13} /></button></div>;
}

function AssetsModal({ server, isOwner, onClose, onToast, onRefresh, onServerUpdate }: { server: Server; isOwner: boolean; onClose: () => void; onToast: (v: string) => void; onRefresh: () => Promise<void>; onServerUpdate: (server: Server) => void }) {
  const [crop, setCrop] = useState<'serverIcon' | 'serverBanner' | null>(null);
  const [assets, setAssets] = useState<Array<{ id: string; type: 'emoji' | 'sticker' | 'sound'; name: string; url: string; mime: string }>>([]);
  const [assetType, setAssetType] = useState<'emoji' | 'sticker' | 'sound'>('emoji');
  const [assetName, setAssetName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { api<{ assets: typeof assets }>(`/api/servers/${server.id}/assets`).then(({ assets: list }) => setAssets(list)).catch(() => {}); }, [server.id]);
  const upload = async (file?: File) => {
    if (!file) return;
    const audio = assetType === 'sound';
    const allowedAudio = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac'];
    const supported = audio ? allowedAudio.includes(file.type) : ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!supported) { setError(audio ? 'Choose an MP3, WAV, OGG, WebM, MP4 or AAC sound.' : 'Choose a JPG, PNG, or WebP image.'); return; }
    if (file.size > (audio ? 10 : 8) * 1024 * 1024) { setError(`Files must be smaller than ${audio ? '10' : '8'} MB.`); return; }
    const cleanName = (assetName || file.name.replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 32);
    if (cleanName.length < 2) { setError('Asset names need at least 2 letters or numbers.'); return; }
    setPending(true); setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Couldn’t read that file.')); reader.readAsDataURL(file); });
      const { asset } = await api<{ asset: typeof assets[number] }>(`/api/servers/${server.id}/assets`, { method: 'POST', body: JSON.stringify({ type: assetType, name: cleanName, dataUrl }) });
      setAssets((current) => [...current, asset]); setAssetName(''); await onRefresh(); onToast(`${cleanName} is ready for your space.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t add this asset.'); }
    finally { setPending(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const remove = async (asset: typeof assets[number]) => {
    if (!window.confirm(`Remove ${asset.name} from this space?`)) return;
    try { await api(`/api/servers/${server.id}/assets/${asset.id}`, { method: 'DELETE' }); setAssets((current) => current.filter((item) => item.id !== asset.id)); await onRefresh(); onToast(`${asset.name} removed.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t remove the asset.'); }
  };
  return <>
    {crop && <ImageCropper title={crop === 'serverIcon' ? `${server.name} icon` : `${server.name} banner`} aspect={crop === 'serverIcon' ? 1 : 2.6} shape={crop === 'serverIcon' ? 'circle' : 'banner'} onClose={() => setCrop(null)} onSave={async (data) => { const { server: updated } = await api<{ server: Server }>('/api/profile/asset', { method: 'POST', body: JSON.stringify({ type: crop, dataUrl: data, serverId: server.id }) }); onServerUpdate(updated); onToast(crop === 'serverIcon' ? 'Space icon saved.' : 'Space banner saved.'); }} />}
    <Modal title="Make it yours." kicker={`${server.name.toUpperCase()} · EXTRAS`} onClose={onClose} className="assets-modal">
      <div className="asset-modal-body">
        <div className="asset-header-row"><span className="asset-heading-icon"><Sparkles size={20} /></span><div><b>A little character goes a long way.</b><small>Small touches that feel like your space.</small></div></div>
        <div className="server-image-tiles">
          <button disabled={!isOwner} onClick={() => setCrop('serverIcon')}><span className="server-icon-preview">{server.icon ? <img src={assetUrl(server.icon)} alt="" /> : initials(server.name)}</span><b>Space icon</b><small>{isOwner ? 'Square image · up to 8 MB' : 'Only admins can edit'}</small><ImagePlus size={14} /></button>
          <button disabled={!isOwner} onClick={() => setCrop('serverBanner')}><span className="server-banner-preview" style={server.banner ? { backgroundImage: `url(${assetUrl(server.banner)})` } : undefined}><ImagePlus size={17} /></span><b>Space banner</b><small>{isOwner ? 'Wide image · up to 8 MB' : 'Only admins can edit'}</small></button>
        </div>
        <div className="asset-upload-panel">
          <div className="asset-type-tabs">{(['emoji', 'sticker', 'sound'] as const).map((kind) => <button key={kind} className={assetType === kind ? 'active' : ''} onClick={() => { setAssetType(kind); setError(''); }}>{kind === 'emoji' ? <Smile size={13} /> : kind === 'sticker' ? <Sticker size={13} /> : <AudioLines size={13} />}{kind}</button>)}</div>
          <div className="asset-upload-fields"><label>Asset name<input value={assetName} maxLength={32} onChange={(event) => setAssetName(event.target.value)} placeholder={assetType === 'sound' ? 'soft-chime' : `tiny-${assetType}`} /></label><button disabled={!isOwner || pending} className="button subtle small" onClick={() => fileInput.current?.click()}>{pending ? 'Uploading…' : <><Plus size={13} />Upload {assetType}</>}</button><input ref={fileInput} type="file" hidden accept={assetType === 'sound' ? 'audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac' : 'image/jpeg,image/png,image/webp'} onChange={(event) => void upload(event.target.files?.[0])} /></div>
          <small className="asset-upload-hint">{assetType === 'sound' ? 'MP3, WAV, OGG, WebM, MP4 or AAC · up to 10 MB' : 'JPG, PNG or WebP · up to 8 MB'}</small>
          {error && <p className="form-error">{error}</p>}
          <div className="community-assets">{assets.filter((asset) => asset.type === assetType).map((asset) => <div key={asset.id} className="community-asset">{asset.type === 'sound' ? <span className="sound-asset-icon"><AudioLines size={15} /></span> : <img src={assetUrl(asset.url)} alt="" />}<span><b>{asset.name}</b><small>{asset.type}</small></span>{asset.type === 'sound' && <audio controls preload="none" src={assetUrl(asset.url)} aria-label={`Preview ${asset.name}`} />}{isOwner && <button aria-label={`Remove ${asset.name}`} title={`Remove ${asset.name}`} onClick={() => void remove(asset)}><X size={14} /></button>}</div>)}{assets.every((asset) => asset.type !== assetType) && <span className="no-assets">{isOwner ? `No custom ${assetType}s yet. Add one for everyone here.` : `No custom ${assetType}s in this space yet.`}</span>}</div>
        </div>
        <div className="asset-feature-note"><span><SmilePlus size={16} /></span><div><b>Ready to share with your space</b><p>Uploaded emoji and stickers work in chat; sounds are stored and can be played by anyone in the space.</p></div></div>
        <div className="asset-permission-note"><Shield size={14} />Only server owners and admins can upload or remove shared assets.</div>
      </div>
      <div className="modal-actions"><div className="action-spacer" /><Button className="primary" onClick={onClose}>Done</Button></div>
    </Modal>
  </>;
}

