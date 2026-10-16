import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react';
import {
  Activity, AudioLines, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CirclePlus,
  Command, Copy, Hash, Headphones, ImagePlus, LogOut, Menu, MessageCircle, Mic, MoreHorizontal,
  PanelRight, Phone, Plus, Search, Send, Settings2, Shield, Sparkles, Sticker, Volume2, Waves,
  X, Users, UserPlus, Smile, AtSign, Pencil, CheckCheck, Crown, Paperclip, MessageSquare, Moon,
  Palette, Radio, Camera, Share2, Download, Dot, LockKeyhole, SmilePlus, MoveRight, } from 'lucide-react';
import { api, apiBase, assetUrl, createSocket } from './api';
import type { Attachment, Channel, Conversation, Invite, Member, Message, Server, Status, User } from './types';
import ImageCropper from './components/ImageCropper';
import VoiceCall from './components/VoiceCall';
import type { Socket } from 'socket.io-client';

const emoji = ['✨', '👋', '💜', '🙌', '😂', '🔥', '🎉', '🫶', '🌿', '💡', '👀', '💛'];
const stickers = [{ emoji: '🌱', label: 'A little growth' }, { emoji: '🪩', label: 'Good energy' }, { emoji: '🫧', label: 'Just floating by' }, { emoji: '☕', label: 'Coffee break' }];
const palette = { violet: '#9a8cff', ocean: '#73c7e8', moss: '#a5cd8a', rose: '#f09cb7', light: '#6575dd', system: '#9ba2b4' } as const;

function initials(name = '?') { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (data: { user: User; servers: Server[]; friends?: User[]; conversations?: Conversation[] }) => void }) {
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

type ModalKind = 'profile' | 'server' | 'serverSettings' | 'channel' | 'invite' | 'friends' | 'members' | 'assets' | 'settings' | null;

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalServerId, setModalServerId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [page, setPage] = useState<'chat' | 'friends' | 'dms'>('chat');
  const [rightOpen, setRightOpen] = useState(true);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [dmVoiceCounts, setDmVoiceCounts] = useState<Record<string, number>>({});
  const [serverAssets, setServerAssets] = useState<Array<{ id: string; type: 'emoji' | 'sticker' | 'sound'; name: string; url: string; mime: string }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
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
  const activeChannel = activeServer?.channels.find((channel) => channel.id === activeChannelId) || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const isOwner = Boolean(activeServer?.members?.find((member) => member.userId === user?.id && ['owner', 'admin'].includes(member.role)));
  const activeChannelRef = useRef(activeChannelId);
  const activeConversationRef = useRef(activeConversationId);
  useEffect(() => { activeChannelRef.current = activeChannelId; activeConversationRef.current = activeConversationId; }, [activeChannelId, activeConversationId]);

  const applySession = useCallback((data: { user: User; servers: Server[]; friends?: User[]; conversations?: Conversation[] }) => {
    setUser(data.user); setServers(data.servers || []); setFriends(data.friends || []); setConversations(data.conversations || []);
    const first = data.servers?.[0];
    setActiveServerId(first?.id || null);
    setActiveChannelId(first?.channels?.find((channel) => channel.kind === 'text')?.id || null);
  }, []);

  useEffect(() => {
    api<{ user: User; servers: Server[]; friends: User[]; conversations: Conversation[] }>('/api/auth/me').then((data) => {
      setUser(data.user); setServers(data.servers); setFriends(data.friends); setConversations(data.conversations);
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
    if (!user) return;
    const live = createSocket(); setSocket(live);
    live.on('connect', () => setOnlineIds((current) => [...new Set([...current, user.id])]));
    live.on('presence:snapshot', (ids: string[]) => setOnlineIds([...new Set([...ids, user.id])]));
    live.on('presence:update', ({ userId, online }: { userId: string; online: boolean }) => setOnlineIds((current) => online ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    live.on('chat:message', (message: Message) => {
      const belongs = message.scope === 'channel' ? message.channelId === activeChannelRef.current : message.conversationId === activeConversationRef.current;
      if (belongs) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    live.on('chat:update', (message: Message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)));
    live.on('chat:delete', ({ messageId }: { messageId: string }) => setMessages((current) => current.filter((item) => item.id !== messageId)));
    live.on('chat:typing', ({ userId, name, typing: isTyping }: { userId: string; name: string; typing: boolean }) => {
      if (userId === user.id) return;
      setTyping((current) => isTyping ? current.includes(name) ? current : [...current, name] : current.filter((item) => item !== name));
      window.setTimeout(() => setTyping((current) => current.filter((item) => item !== name)), 3000);
    });
    live.on('voice:presence', ({ channelId, count }: { channelId: string; count: number }) => {
      setServers((current) => current.map((server) => ({ ...server, channels: server.channels.map((channel) => channel.id === channelId ? { ...channel, topic: `${count} ${count === 1 ? 'person' : 'people'} connected` } : channel) })));
    });
    live.on('voice:dm-presence', ({ conversationId, count }: { conversationId: string; count: number }) => setDmVoiceCounts((current) => ({ ...current, [conversationId]: count })));
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
    const path = activeChannelId ? `/api/channels/${activeChannelId}/messages` : activeConversationId ? `/api/conversations/${activeConversationId}/messages` : '';
    if (!path) { setMessages([]); return; }
    let current = true; setMessages([]);
    api<{ messages: Message[] }>(path).then(({ messages: list }) => { if (current) setMessages(list); }).catch((error) => { if (current) setToast(error.message); });
    return () => { current = false; };
  }, [user?.id, activeChannelId, activeConversationId]);

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
    const data = await api<{ user: User; servers: Server[]; friends: User[]; conversations: Conversation[] }>('/api/auth/me');
    setUser(data.user); setServers(data.servers); setFriends(data.friends); setConversations(data.conversations);
  }, []);
  const selectServer = (server: Server) => { setPage('chat'); setActiveServerId(server.id); setActiveChannelId(server.channels.find((c) => c.kind === 'text')?.id || null); setActiveConversationId(null); setVoiceChannelId(null); setSendText(''); setAttachments([]); setNavOpen(false); };
  const selectChannel = (channel: Channel) => { setPage('chat'); setActiveChannelId(channel.id); setActiveConversationId(null); setVoiceChannelId(channel.kind === 'voice' ? channel.id : null); setSendText(''); setAttachments([]); setNavOpen(false); };
  const selectConversation = (conversation: Conversation) => { setPage('dms'); setActiveConversationId(conversation.id); setActiveChannelId(null); setVoiceChannelId(null); setSendText(''); setAttachments([]); setNavOpen(false); };
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
  const sendMessage = (value = sendText) => {
    const text = value.trim(); const files = value === sendText ? attachments : [];
    if ((!text && !files.length) || !socket) return;
    const payload = activeConversationId ? { scope: 'dm', conversationId: activeConversationId, text, attachments: files } : { scope: 'channel', channelId: activeChannelId, text, attachments: files };
    if (!activeChannelId && !activeConversationId) return;
    socket.emit('chat:send', payload, (result: { error?: string }) => { if (result?.error) setToast(result.error); });
    setSendText(''); setAttachments([]); setComposerOpen(null); if (composer.current) composer.current.style.height = 'auto';
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
  const createChannel = async (name: string, kind: 'text' | 'voice') => {
    if (!activeServer) return;
    const { channel } = await api<{ channel: Channel }>(`/api/servers/${activeServer.id}/channels`, { method: 'POST', body: JSON.stringify({ name, kind }) });
    setServers((current) => current.map((server) => server.id === activeServer.id ? { ...server, channels: [...server.channels, channel] } : server)); setModal(null); selectChannel(channel); setToast(`${kind === 'text' ? 'Text' : 'Voice'} channel created.`);
  };
  const saveServerSettings = async (serverId: string, values: { name: string; description: string }) => {
    const { server } = await api<{ server: Server }>(`/api/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(values) });
    setServers((current) => current.map((item) => item.id === serverId ? { ...item, ...server } : item));
    setModal(null); setToast('Space details saved.');
  };
  const openServerModal = (kind: ModalKind, serverId?: string) => { setModalServerId(serverId || activeServerId); setModal(kind); };
  const directInvite = async (handle: string) => {
    const { friend } = await api<{ friend: User }>('/api/friends', { method: 'POST', body: JSON.stringify({ handle }) });
    await refreshSession(); setToast(`${friend.name} is in your conversations.`); setModal(null);
  };
  const updateProfile = async (values: { name: string; bio: string; status: Status; theme: User['theme'] }) => {
    const { user: updated } = await api<{ user: User }>('/api/profile', { method: 'PATCH', body: JSON.stringify(values) });
    setUser(updated); document.documentElement.dataset.theme = updated.theme; setModal(null); setToast('Your profile is up to date.');
  };
  const saveUserImage = async (type: 'avatar' | 'banner', dataUrl: string) => {
    const { user: updated } = await api<{ user: User }>('/api/profile/asset', { method: 'POST', body: JSON.stringify({ type, dataUrl }) }); setUser(updated); setToast(type === 'avatar' ? 'Profile photo saved.' : 'Profile banner saved.');
  };
  const logout = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} setSocket(null); setUser(null); setServers([]); setFriends([]); setConversations([]); setMessages([]); setVoiceChannelId(null); };

  const theme = user?.theme || 'violet';
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const filteredFriends = useMemo(() => friends.filter((friend) => `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase())), [friends, query]);
  const displayName = activeConversation?.otherUser?.name || activeChannel?.name || 'Find your people';
  const channelMessages = messages;
  const onlineFriendCount = friends.filter((friend) => onlineIds.includes(friend.id)).length;

  if (!user) return bootstrapping ? <main className="auth-loading"><BrandMark /><span>Opening your space…</span></main> : <AuthScreen onAuthenticated={(data) => { applySession(data); setToast('Welcome to CORE.'); }} />;

  return <main className={`app-shell ${navOpen ? 'mobile-nav-open' : ''}`}>
    <aside className="server-rail" aria-label="Spaces"><div className="rail-brand"><BrandMark /></div><div className="rail-rule" />
      <button className={`rail-icon home ${page !== 'chat' || !activeServer ? 'selected' : ''}`} aria-label="Direct messages" title="Direct messages" onClick={() => { setPage('dms'); setActiveConversationId(conversations[0]?.id || null); setActiveChannelId(null); setVoiceChannelId(null); setNavOpen(false); }}><MessageCircle size={20} /><i className="rail-pill" /></button>
      <div className="rail-scroll">{servers.map((server) => <button key={server.id} className={`rail-icon ${server.id === activeServerId && page === 'chat' ? 'selected' : ''}`} aria-label={server.name} title={server.name} onClick={() => selectServer(server)}><span className="rail-server">{server.icon ? <img src={assetUrl(server.icon)} alt="" /> : initials(server.name)}</span><i className="rail-pill" /></button>)}</div>
      <button className="rail-icon rail-add" aria-label="Create a space" title="Create a space" onClick={() => setModal('server')}><Plus size={20} /></button><button className="rail-icon rail-discover" aria-label="Find friends" title="Find friends" onClick={() => setModal('friends')}><UserPlus size={18} /></button>
      <div className="rail-bottom"><button className="rail-icon rail-help" aria-label="Help and setup" title="Help and setup" onClick={() => setModal('settings')}><CircleHelp size={18} /></button></div>
    </aside>

    <aside className={`nav-panel ${navOpen ? 'open' : ''}`}>
      <div className="nav-heading"><div className="nav-title"><span className="brand-lockup"><BrandMark /><b>CORE</b></span><span className="nav-divider" />{activeServer ? <button className="space-menu" onClick={() => openServerModal('serverSettings')}><span className="space-name">{activeServer.name}</span><ChevronDown size={15} /></button> : <span className="space-name">Your space</span>}</div><IconButton label="Close navigation" className="mobile-close" onClick={() => setNavOpen(false)}><X size={17} /></IconButton></div>
      <button className="nav-search" onClick={() => setSearchOpen((v) => !v)}><Search size={15} /><span>Search everything</span><kbd><Command size={10} /> K</kbd></button>
      {searchOpen && <div className="search-panel"><Search size={14} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a channel or person" /><IconButton label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}><X size={14} /></IconButton></div>}

      <div className="nav-scroll">
        {!activeServer || page !== 'chat' ? <><div className="nav-section-title"><span>YOUR SPACE</span><button aria-label="Add a friend" title="Add a friend" onClick={() => setModal('friends')}><Plus size={15} /></button></div>
          <button className={`nav-item ${page === 'dms' && !activeConversationId ? 'active' : ''}`} onClick={() => { setPage('dms'); setActiveConversationId(null); setActiveChannelId(null); }}><MessageCircle size={17} /><span>Messages</span>{conversations.length > 0 && <small className="nav-count">{conversations.length}</small>}</button>
          <button className={`nav-item ${page === 'friends' ? 'active' : ''}`} onClick={() => { setPage('friends'); setActiveChannelId(null); setActiveConversationId(null); }}><Users size={17} /><span>Friends</span><small className="nav-count">{onlineFriendCount}</small></button>
          <div className="nav-section-title dm-section"><span>DIRECT MESSAGES</span><button aria-label="Start a conversation" title="Start a conversation" onClick={() => setModal('friends')}><Plus size={15} /></button></div>
          {conversations.map((conversation) => <button key={conversation.id} className={`dm-row ${activeConversationId === conversation.id ? 'active' : ''}`} onClick={() => selectConversation(conversation)}><Avatar user={conversation.otherUser} status /><span className="dm-name">{conversation.otherUser.name}</span><span className="dm-presence">{onlineIds.includes(conversation.otherUser.id) ? 'Here now' : 'Away'}</span></button>)}
          {conversations.length === 0 && <div className="nav-empty"><span className="nav-empty-icon"><MessageCircle size={17} /></span><p>Good conversations<br />start with a hello.</p><button onClick={() => setModal('friends')}>Find someone</button></div>}
        </> : <><div className="server-banner" style={activeServer.banner ? { backgroundImage: `linear-gradient(180deg,rgba(16,18,25,.05),rgba(16,18,25,.95)),url(${assetUrl(activeServer.banner)})` } : undefined}><div className="server-banner-top"><span className="eyebrow">YOUR SPACE</span><button className="banner-menu" title="Space settings" onClick={() => openServerModal('serverSettings')}><Settings2 size={16} /></button></div><div className="server-hero-mark">{activeServer.icon ? <img src={assetUrl(activeServer.icon)} alt="" /> : initials(activeServer.name)}</div><h2>{activeServer.name}</h2><p>{activeServer.description || 'A good place to be.'}</p><div className="server-people"><span className="live-dot" />{activeServer.members?.length || 1} {activeServer.members?.length === 1 ? 'person' : 'people'} here</div></div>
          <div className="nav-section-title"><span>TEXT CHANNELS</span>{isOwner && <button aria-label="Create text channel" title="Create text channel" onClick={() => { setModalServerId(activeServer.id); setModal('channel'); }}><Plus size={15} /></button>}</div>
          {activeServer.channels.filter((channel) => channel.kind === 'text').map((channel) => <button key={channel.id} className={`channel-row ${activeChannelId === channel.id ? 'active' : ''}`} onClick={() => selectChannel(channel)}><Hash size={16} /><span>{channel.name}</span>{channel.topic?.includes('connected') && <small className="voice-count">{channel.topic.split(' ')[0]}</small>}</button>)}
          <div className="nav-section-title voice-heading"><span>VOICE CHANNELS</span>{isOwner && <button aria-label="Create voice channel" title="Create voice channel" onClick={() => { setModalServerId(activeServer.id); setModal('channel'); }}><Plus size={15} /></button>}</div>
          {activeServer.channels.filter((channel) => channel.kind === 'voice').map((channel) => <div key={channel.id}><button className={`channel-row voice-row ${voiceChannelId === channel.id ? 'active' : ''}`} onClick={() => selectChannel(channel)}><Volume2 size={16} /><span>{channel.name}</span>{channel.topic?.includes('connected') && <small className="voice-count">{channel.topic.split(' ')[0]}</small>}</button>{voiceChannelId === channel.id && <div className="voice-mini-status"><span className="audio-status-dot" />You’re connected <button onClick={() => setVoiceChannelId(null)}>Leave</button></div>}</div>)}
          <div className="nav-section-title server-tools"><span>GOOD EXTRAS</span><button aria-label="Manage community extras" title="Manage community extras" onClick={() => openServerModal('assets')}><Plus size={15} /></button></div>
          <button className="channel-row" onClick={() => openServerModal('assets')}><Sparkles size={16} /><span>Emoji & stickers</span></button><button className="channel-row" onClick={() => { setComposerOpen('sound'); setToast('Open soundboard from the message box to play a sound.'); setActiveChannelId(activeServer.channels.find((c) => c.kind === 'text')?.id || null); }}><AudioLines size={16} /><span>Soundboard</span></button>
          <button className="server-invite-shortcut" onClick={openInvite}><UserPlus size={15} /><span>Invite someone</span><ChevronRight size={14} /></button>
        </>}
      </div>
      <div className="user-dock"><button className="user-card" onClick={() => setModal('profile')}><Avatar user={user} status /><span className="user-card-details"><b>{user.name}</b><small>@{user.handle}</small></span><span className="user-status-mark"><span className={`presence-dot ${user.status}`} /></span></button><div className="user-actions"><IconButton label="User settings" onClick={() => setModal('profile')}><Settings2 size={17} /></IconButton><IconButton label="Sign out" onClick={logout}><LogOut size={16} /></IconButton></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={19} /></button><button className="crumb-back" aria-label="Back to spaces" onClick={() => setNavOpen(true)}><ChevronLeft size={15} /></button><div className="crumb-icon">{page === 'friends' ? <Users size={17} /> : page === 'dms' ? <MessageCircle size={17} /> : activeChannel?.kind === 'voice' ? <Volume2 size={17} /> : <Hash size={17} />}</div><div className="topbar-title"><strong>{page === 'friends' ? 'Friends' : page === 'dms' && !activeConversation ? 'Messages' : displayName}</strong><span>{page === 'friends' ? 'Your circle, at a glance.' : activeConversation ? `@${activeConversation.otherUser.handle}` : activeChannel?.topic || (activeServer ? activeServer.name : 'The people who make life good')}</span></div>
        <div className="topbar-actions"><span className="connection-indicator"><i className={`connection-dot ${socket?.connected ? 'live' : ''}`} />{socket?.connected ? 'Live' : 'Offline'}</span>{page === 'chat' && activeServer && <IconButton label="Invite to this space" onClick={openInvite}><UserPlus size={17} /></IconButton>}{page === 'chat' && activeChannel?.kind === 'voice' && <IconButton label={voiceChannelId === activeChannel.id ? 'In voice call' : 'Join voice call'} className="quick-call" onClick={() => setVoiceChannelId(activeChannel.id)}><Phone size={16} /><span>{voiceChannelId === activeChannel.id ? 'In call' : 'Join call'}</span></IconButton>}{activeConversation && <IconButton label={dmVoiceCounts[activeConversation.id] ? 'Join private call' : 'Start private call'} className="quick-call" onClick={() => setVoiceChannelId(`dmvoice:${activeConversation.id}`)}><Phone size={16} /><span>{voiceChannelId === `dmvoice:${activeConversation.id}` ? 'In call' : dmVoiceCounts[activeConversation.id] ? 'Join call' : 'Call'}</span></IconButton>}{(page === 'dms' || activeConversation) && <IconButton label="Add a friend" onClick={() => setModal('friends')}><UserPlus size={17} /></IconButton>}<IconButton label={rightOpen ? 'Hide people panel' : 'Show people panel'} className={rightOpen ? 'active-soft' : ''} onClick={() => setRightOpen((v) => !v)}><PanelRight size={17} /></IconButton><IconButton label="Settings" onClick={() => setModal('profile')}><Settings2 size={17} /></IconButton></div>
      </header>

      {page === 'friends' ? <FriendsPage friends={filteredFriends} onlineIds={onlineIds} query={query} setQuery={setQuery} onAdd={() => setModal('friends')} onMessage={(friend) => { const conversation = conversations.find((item) => item.memberIds.includes(friend.id)); if (conversation) selectConversation(conversation); else { setModal('friends'); setToast('Add this person by their CORE handle to start a conversation.'); } }} /> : page === 'dms' && !activeConversation ? <DirectMessagesPage conversations={conversations} onlineIds={onlineIds} onSelect={selectConversation} onAdd={() => setModal('friends')} /> : <>
        {voiceChannelId && ((activeChannel?.kind === 'voice' && activeChannel.id === voiceChannelId) || (activeConversation && voiceChannelId === `dmvoice:${activeConversation.id}`)) ? <VoiceCall key={voiceChannelId} channelId={voiceChannelId} channelName={activeConversation?.otherUser.name || activeChannel?.name || 'Private call'} socket={socket} user={user} onLeave={() => setVoiceChannelId(null)} /> : <div className="chat-layout">
          <section className="chat-column">
            {channelMessages.length === 0 ? <div className="chat-welcome"><div className="welcome-symbol">{activeConversation ? <Avatar user={activeConversation.otherUser} size="avatar-lg" /> : <span><Hash size={23} /></span>}</div><span className="eyebrow">{activeConversation ? 'JUST BETWEEN YOU TWO' : `A FRESH START · ${activeServer?.name?.toUpperCase() || 'CORE'}`}</span><h2>{activeConversation ? `You and ${activeConversation.otherUser.name}` : `Welcome to #${activeChannel?.name || 'general'}`}</h2><p>{activeConversation ? 'This is the beginning of something good.' : activeChannel?.topic || 'A little space to share whatever’s on your mind.'}</p>{!activeConversation && <div className="welcome-actions"><button onClick={openInvite}><UserPlus size={15} />Invite someone</button><span>or just say hello</span></div>}</div> : <div className="message-list" role="log" aria-live="polite">{channelMessages.map((message, index) => <MessageRow key={message.id} message={message} previous={channelMessages[index - 1]} assets={serverAssets} currentUserId={user.id} canManage={Boolean(activeChannel && isOwner)} onReact={reactToMessage} onEdit={editMessage} onDelete={deleteMessage} />)}<div className="message-end" /></div>}
            {typing.length > 0 && <div className="typing-label"><span className="typing-dots"><i /><i /><i /></span><b>{typing.join(', ')}</b>{typing.length === 1 ? ' is typing' : ' are typing'}</div>}
            {!activeConversation && !activeChannel && <div className="empty-workspace"><Sparkles size={20} /><h2>Your people, your place.</h2><p>Create a space, or accept an invite to join one.</p><Button className="primary" onClick={() => setModal('server')}><Plus size={16} />Create a space</Button></div>}
            {(activeConversation || activeChannel?.kind === 'text') && <div className="composer-wrap"><input ref={attachmentInput} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,application/pdf,text/plain" onChange={(event) => void uploadAttachments(event.currentTarget.files)} />{attachments.length > 0 && <div className="attachment-staging">{attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`}><span>{attachment.mime.startsWith('image/') ? <img src={assetUrl(attachment.url)} alt="" /> : <Paperclip size={14} />}</span><b title={attachment.name}>{attachment.name}</b><button aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></div>)}</div>}<div className="composer-box"><button className="composer-attach" aria-label="Attach a file" title="Attach a file" disabled={uploadingAttachments} onClick={() => attachmentInput.current?.click()}><Paperclip size={17} /></button><textarea ref={composer} rows={1} value={sendText} onChange={(e) => { inputChanged(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 144)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={uploadingAttachments ? 'Adding attachment…' : `Message ${activeConversation?.otherUser.name || `#${activeChannel?.name || 'general'}`}`} aria-label="Write a message" maxLength={2000} /><div className="composer-tools"><div className="composer-pop-anchor"><IconButton label="Emoji" onClick={() => setComposerOpen(composerOpen === 'emoji' ? null : 'emoji')}><Smile size={18} /></IconButton>{composerOpen === 'emoji' && <div className="composer-popover emoji-popover"><span className="popover-title">A little feeling</span><div className="emoji-grid">{emoji.map((icon) => <button key={icon} aria-label={`Insert ${icon}`} onClick={() => { setSendText((v) => `${v}${icon}`); setComposerOpen(null); composer.current?.focus(); }}>{icon}</button>)}{serverAssets.filter((asset) => asset.type === 'emoji').map((asset) => <button key={asset.id} title={`:${asset.name}:`} aria-label={`Insert ${asset.name}`} onClick={() => { setSendText((v) => `${v}:${asset.name}:`); setComposerOpen(null); composer.current?.focus(); }}><img src={assetUrl(asset.url)} alt={asset.name} /></button>)}</div></div>}</div>
                    <div className="composer-pop-anchor"><IconButton label="Stickers" onClick={() => setComposerOpen(composerOpen === 'sticker' ? null : 'sticker')}><Sticker size={17} /></IconButton>{composerOpen === 'sticker' && <div className="composer-popover sticker-popover"><span className="popover-title">Little expressions</span><div className="sticker-grid">{stickers.map((item) => <button key={item.label} title={item.label} onClick={() => sendMessage(`${item.emoji} ${item.label}`)}><span>{item.emoji}</span><small>{item.label}</small></button>)}{serverAssets.filter((asset) => asset.type === 'sticker').map((asset) => <button key={asset.id} title={asset.name} onClick={() => sendMessage(`[[sticker:${asset.name}]]`)}><img src={assetUrl(asset.url)} alt="" /><small>{asset.name}</small></button>)}</div></div>}</div>
                    <div className="composer-pop-anchor"><IconButton label="Soundboard" onClick={() => setComposerOpen(composerOpen === 'sound' ? null : 'sound')}><AudioLines size={17} /></IconButton>{composerOpen === 'sound' && <Soundboard assets={serverAssets.filter((asset) => asset.type === 'sound')} onClose={() => setComposerOpen(null)} onManage={() => { setComposerOpen(null); openServerModal('assets'); }} />}</div><button className={`send-button ${sendText.trim() || attachments.length ? 'ready' : ''}`} aria-label="Send message" disabled={(!sendText.trim() && !attachments.length) || uploadingAttachments} onClick={() => sendMessage()}><Send size={16} /></button>
                    </div><div className="composer-foot"><span><kbd>Enter</kbd> to send <i /> <kbd>Shift + Enter</kbd> for a new line</span><span className="composer-privacy"><LockKeyhole size={11} />Just your circle</span></div></div></div>}
          </section>
          {rightOpen && <aside className="member-panel"><div className="member-panel-heading"><span>PEOPLE</span><button title="Space members" aria-label="Space members" onClick={() => openServerModal('members')}><Users size={15} /></button></div>{activeConversation ? <><div className="friend-profile-card"><Avatar user={activeConversation.otherUser} size="avatar-profile" status /><b>{activeConversation.otherUser.name}</b><span>@{activeConversation.otherUser.handle}</span><div className="friend-status-line"><i className={`presence-dot ${onlineIds.includes(activeConversation.otherUser.id) ? 'online' : 'idle'}`} />{onlineIds.includes(activeConversation.otherUser.id) ? 'Around now' : 'Away for a bit'}</div><p>{activeConversation.otherUser.bio || 'A little bit about them.'}</p><button className="button subtle wide" onClick={() => setModal('friends')}><UserPlus size={15} />Add another friend</button></div></> : <MemberList members={activeServer?.members || []} onlineIds={onlineIds} onRole={(member) => manageRole(member, activeServer, setServers, setToast)} isOwner={isOwner} currentUserId={user.id} />}</aside>}
        </div>}
      </>}
    </section>

    {modal === 'profile' && <ProfileModal user={user} onClose={() => setModal(null)} onSave={updateProfile} onImage={saveUserImage} onLogout={logout} />}
    {modal === 'server' && <ServerModal onClose={() => setModal(null)} onCreate={createServer} />}
    {modal === 'serverSettings' && activeServer && <ServerSettingsModal server={activeServer} onClose={() => setModal(null)} onSave={saveServerSettings} onImages={() => setModal('assets')} />}
    {modal === 'channel' && <ChannelModal onClose={() => setModal(null)} onCreate={createChannel} />}
    {modal === 'invite' && activeServer && <InviteModal server={activeServer} onClose={() => setModal(null)} onToast={setToast} />}
    {modal === 'friends' && <FriendModal onClose={() => setModal(null)} onAdd={directInvite} />}
    {modal === 'members' && activeServer && <MembersModal server={activeServer} isOwner={isOwner} userId={user.id} onlineIds={onlineIds} onClose={() => setModal(null)} onToast={setToast} onRefresh={refreshSession} />}
    {modal === 'assets' && activeServer && <AssetsModal server={activeServer} isOwner={isOwner} onClose={() => setModal(null)} onToast={setToast} onRefresh={() => api<{ assets: typeof serverAssets }>(`/api/servers/${activeServer.id}/assets`).then(({ assets }) => setServerAssets(assets))} onServerUpdate={(updated) => setServers((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))} />}
    {modal === 'settings' && <Modal title="A little help" kicker="CORE GUIDE" onClose={() => setModal(null)}><div className="settings-guide"><span><Mic size={16} />Calls</span><p>Join a voice room from the channel list. CORE will ask before using your microphone or camera.</p><span><Shield size={16} />Your space</span><p>Start local to explore; point the app at a shared server when your group is ready.</p><span><CircleHelp size={16} />Need a hand?</span><p>Check the project README for setup, server hosting and release notes.</p></div><div className="modal-actions"><div className="action-spacer" /><Button className="primary" onClick={() => setModal(null)}>Got it</Button></div></Modal>}
    {toast && <Toast message={toast} onClose={() => setToast('')} />}
  </main>;
}

const reactionChoices = ['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👏'];
function MessageRow({ message, previous, assets = [], currentUserId, canManage, onReact, onEdit, onDelete }: { message: Message; previous?: Message; assets?: Array<{ id: string; type: 'emoji' | 'sticker' | 'sound'; name: string; url: string; mime: string }>; currentUserId: string; canManage: boolean; onReact: (messageId: string, emoji: string) => Promise<boolean>; onEdit: (messageId: string, text: string) => Promise<boolean>; onDelete: (messageId: string) => Promise<boolean> }) {
  const grouped = previous && previous.authorId === message.authorId && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
  const own = message.authorId === currentUserId;
  const [pickerOpen, setPickerOpen] = useState(false); const [menuOpen, setMenuOpen] = useState(false); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(message.text);
  if (message.system) return <div className="system-message"><span className="system-star"><Sparkles size={13} /></span><span>{message.text}</span><small>{timeLabel(message.createdAt)}</small></div>;
  const submitEdit = async () => { if (await onEdit(message.id, draft)) setEditing(false); };
  const remove = async () => { if (window.confirm('Delete this message? This can’t be undone.')) await onDelete(message.id); };
  const copy = async () => { try { await navigator.clipboard.writeText(message.text); } catch {} setMenuOpen(false); };
  return <article className={`message-row ${grouped ? 'grouped' : ''}`}><div className="message-avatar">{!grouped && <Avatar user={{ name: message.author, avatar: message.avatar, status: 'online' }} />}</div><div className="message-content">{!grouped && <div className="message-byline"><b>{message.author}</b><small>{timeLabel(message.createdAt)}{message.editedAt ? ' · edited' : ''}</small></div>}{editing ? <div className="message-edit"><textarea autoFocus value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitEdit(); } }} /><div><button onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={!draft.trim()} onClick={() => void submitEdit()}>Save</button></div></div> : <>{message.text && <p><MessageBody text={message.text} assets={assets} /></p>}<MessageAttachments attachments={message.attachments || []} /></>}<div className="message-reactions">{(message.reactions || []).map((reaction) => <button key={reaction.emoji} className={reaction.userIds.includes(currentUserId) ? 'reacted' : ''} title={`${reaction.userIds.length} reaction${reaction.userIds.length === 1 ? '' : 's'}`} onClick={() => void onReact(message.id, reaction.emoji)}>{reaction.emoji}<small>{reaction.userIds.length}</small></button>)}<div className="message-action-anchor"><button className="reaction-add" aria-label="Add a reaction" title="Add a reaction" onClick={() => { setPickerOpen((value) => !value); setMenuOpen(false); }}><SmilePlus size={15} /></button>{pickerOpen && <div className="reaction-picker" role="group" aria-label="Choose a reaction">{reactionChoices.map((icon) => <button key={icon} aria-label={`React with ${icon}`} onClick={() => { void onReact(message.id, icon); setPickerOpen(false); }}>{icon}</button>)}</div>}</div><div className="message-action-anchor"><button className="message-more" aria-label="Message actions" title="Message actions" onClick={() => { setMenuOpen((value) => !value); setPickerOpen(false); }}><MoreHorizontal size={15} /></button>{menuOpen && <div className="message-menu"><button onClick={() => void copy()}><Copy size={13} />Copy text</button>{(own || canManage) && <button onClick={() => { setDraft(message.text); setEditing(true); setMenuOpen(false); }}><Pencil size={13} />Edit message</button>}{(own || canManage) && <button className="message-delete" onClick={() => { setMenuOpen(false); void remove(); }}><X size={13} />Delete message</button>}</div>}</div></div></div></article>;
}
function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return <div className="message-attachments">{attachments.map((attachment) => <div className={`message-attachment ${attachment.mime.startsWith('image/') ? 'attachment-image' : ''}`} key={attachment.url}>{attachment.mime.startsWith('image/') ? <a href={assetUrl(attachment.url)} target="_blank" rel="noreferrer"><img src={assetUrl(attachment.url)} alt={attachment.name} loading="lazy" /></a> : attachment.mime.startsWith('video/') ? <video src={assetUrl(attachment.url)} controls preload="metadata" /> : attachment.mime.startsWith('audio/') ? <span className="attachment-file"><AudioLines size={19} /><b>{attachment.name}</b><audio src={assetUrl(attachment.url)} controls preload="metadata" /></span> : <a className="attachment-file" href={assetUrl(attachment.url)} download={attachment.name}><Paperclip size={19} /><b>{attachment.name}</b><small>{(attachment.size / 1024 / 1024).toFixed(1)} MB · download</small></a>}</div>)}</div>;
}
function MessageBody({ text, assets }: { text: string; assets: Array<{ id: string; type: 'emoji' | 'sticker' | 'sound'; name: string; url: string; mime: string }> }) {
  const pattern = /(:([\w-]+):|\[\[sticker:([\w-]+)\]\])/g;
  const result: ReactNode[] = []; let last = 0; let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const asset = assets.find((item) => item.name === (match?.[2] || match?.[3]) && item.type === (match?.[2] ? 'emoji' : 'sticker'));
    if (!asset) continue;
    if (match.index > last) result.push(text.slice(last, match.index));
    if (match[2]) result.push(<img key={`${match.index}-${asset.id}`} className="inline-custom-emoji" src={assetUrl(asset.url)} alt={`:${asset.name}:`} title={asset.name} />);
    else result.push(<span key={`${match.index}-${asset.id}`} className="inline-sticker"><img src={assetUrl(asset.url)} alt={asset.name} /><small>{asset.name}</small></span>);
    last = match.index + match[0].length;
  }
  if (!result.length) return text;
  if (last < text.length) result.push(text.slice(last));
  return result;
}

function MemberList({ members, onlineIds, onRole, isOwner, currentUserId }: { members: Member[]; onlineIds: string[]; onRole: (member: Member) => void; isOwner: boolean; currentUserId: string }) {
    const online = members.filter((member) => onlineIds.includes(member.userId));
  const away = members.filter((member) => !online.some((item) => item.userId === member.userId));
  return <div className="member-list">{online.length > 0 && <><div className="member-group-title"><span>HERE NOW</span><small>{online.length}</small></div>{online.map((member) => <MemberRow key={member.userId} member={member} onRole={onRole} isOwner={isOwner} currentUserId={currentUserId} online />)}</>}{away.length > 0 && <><div className="member-group-title away-title"><span>AROUND LATER</span><small>{away.length}</small></div>{away.map((member) => <MemberRow key={member.userId} member={member} onRole={onRole} isOwner={isOwner} currentUserId={currentUserId} />)}</>}{members.length === 0 && <p className="member-empty">Members will show up here.</p>}</div>;
}
function MemberRow({ member, online, isOwner, currentUserId, onRole }: { member: Member; online?: boolean; isOwner: boolean; currentUserId: string; onRole: (member: Member) => void }) { const displayedUser = online ? member.user : { ...member.user, status: 'idle' as const }; return <div className="member-row"><Avatar user={displayedUser} status /><span className="member-name"><b>{member.user.name}{member.userId === currentUserId && <small className="you-tag">you</small>}</b><small>{member.role === 'owner' ? 'Space owner' : member.role === 'admin' ? 'Admin' : online ? 'Online' : 'Away'}</small></span>{member.role === 'owner' ? <Crown size={13} className="role-crown" /> : isOwner && member.userId !== currentUserId ? <button className="role-button" title={`Change ${member.user.name}'s role`} onClick={() => onRole(member)}><MoreHorizontal size={16} /></button> : null}</div>; }

function FriendsPage({ friends, onlineIds, query, setQuery, onAdd, onMessage }: { friends: User[]; onlineIds: string[]; query: string; setQuery: (v: string) => void; onAdd: () => void; onMessage: (friend: User) => void }) {
  const filtered = friends.filter((friend) => `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="friends-page"><div className="friends-head"><div><span className="eyebrow">THE PEOPLE YOU PICK</span><h1>Your circle.</h1><p>{friends.length ? `${friends.length} friend${friends.length === 1 ? '' : 's'} across your spaces.` : 'Make the first move. The rest gets easier.'}</p></div><Button className="primary" onClick={onAdd}><UserPlus size={16} />Add a friend</Button></div><div className="friends-tools"><div className="filter-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" /></div><span className="friends-filter"><span className="live-dot" />{friends.filter((friend) => onlineIds.includes(friend.id)).length} around now</span></div>{filtered.length ? <div className="friend-grid">{filtered.map((friend) => <div className="friend-card" key={friend.id}><div className="friend-card-top"><Avatar user={friend} size="avatar-lg" status /><span className={`friend-online-label ${onlineIds.includes(friend.id) ? '' : 'away'}`}><i />{onlineIds.includes(friend.id) ? 'Here now' : 'Away'}</span></div><b>{friend.name}</b><small>@{friend.handle}</small><p>{friend.bio || 'Finding my people.'}</p><button onClick={() => onMessage(friend)}><MessageCircle size={15} />Message</button></div>)}</div> : <div className="friends-empty"><div className="empty-orbit"><span>✦</span></div><h2>{friends.length ? 'No one by that name.' : 'A good hello goes a long way.'}</h2><p>{friends.length ? 'Try a different name or handle.' : 'Invite a friend by their CORE handle to start a private conversation.'}</p>{!friends.length && <Button className="subtle" onClick={onAdd}><Plus size={15} />Find your people</Button>}</div>}</div>;
}
function DirectMessagesPage({ conversations, onlineIds, onSelect, onAdd }: { conversations: Conversation[]; onlineIds: string[]; onSelect: (item: Conversation) => void; onAdd: () => void }) {
  return <div className="dms-page"><div className="friends-head"><div><span className="eyebrow">ONE TO ONE, RIGHT HERE</span><h1>Messages.</h1><p>Private conversations, just between you.</p></div><Button className="primary" onClick={onAdd}><Plus size={16} />Start a conversation</Button></div>{conversations.length ? <div className="conversation-list">{conversations.map((item) => <button key={item.id} className="conversation-card" onClick={() => onSelect(item)}><Avatar user={item.otherUser} size="avatar-lg" status /><div><b>{item.otherUser.name}</b><small>@{item.otherUser.handle}</small><p>{onlineIds.includes(item.otherUser.id) ? 'Here now · ready when you are' : 'Drop a note when you like.'}</p></div><ChevronRight size={18} /></button>)}</div> : <div className="friends-empty"><div className="empty-orbit"><MessageCircle size={21} /></div><h2>Make the first move.</h2><p>Find someone by their CORE handle and start a conversation.</p><Button className="subtle" onClick={onAdd}><UserPlus size={15} />Add someone</Button></div>}</div>;
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

function ChannelModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, kind: 'text' | 'voice') => Promise<void> }) {
  const [name, setName] = useState(''); const [kind, setKind] = useState<'text' | 'voice'>('text'); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  return <Modal title="Give it a name." kicker="NEW CHANNEL" onClose={onClose}><div className="channel-kind-select"><button className={kind === 'text' ? 'selected' : ''} onClick={() => setKind('text')}><Hash size={17} /><span><b>Text</b><small>Messages, links and little updates.</small></span><i /></button><button className={kind === 'voice' ? 'selected' : ''} onClick={() => setKind('voice')}><Volume2 size={17} /><span><b>Voice</b><small>Drop in for a real-time conversation.</small></span><i /></button></div><label className="modal-label">Channel name<input autoFocus value={name} maxLength={48} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, ''))} placeholder={kind === 'text' ? 'book-club' : 'coffee-break'} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!name.trim() || pending} onClick={async () => { setPending(true); try { await onCreate(name.trim(), kind); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t create channel.'); setPending(false); } }}>{pending ? 'Creating…' : 'Create channel'}</Button></div></Modal>;
}

function InviteModal({ server, onClose, onToast }: { server: Server; onClose: () => void; onToast: (v: string) => void }) {
  const [invite, setInvite] = useState<Invite | null>(null); const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [hours, setHours] = useState(24); const [error, setError] = useState('');
  const create = async () => { setLoading(true); setError(''); try { const result = await api<{ invite: Invite; url: string }>(`/api/servers/${server.id}/invites`, { method: 'POST', body: JSON.stringify({ expiryHours: hours }) }); setInvite(result.invite); setUrl(result.url); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t create the invite.'); } finally { setLoading(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); onToast('Invite copied. Send it to your people.'); } catch { onToast(url); } };
  const share = async () => { try { await navigator.share({ title: `Join ${server.name} on CORE`, text: 'Come join our space.', url }); } catch { await copy(); } };
  return <Modal title={`Bring someone to ${server.name}.`} kicker="A LITTLE INVITE" onClose={onClose}><div className="invite-intro"><span className="invite-icon"><UserPlus size={20} /></span><p>Send a link to anyone you’d like in this space. They’ll need a CORE account to join.</p></div>{invite ? <div className="invite-result"><span className="invite-link-label">YOUR INVITE LINK</span><div className="invite-link-row"><input readOnly value={url} aria-label="Invite link" /><button onClick={copy} aria-label="Copy invite"><Copy size={16} /></button><button onClick={share} aria-label="Share invite"><Share2 size={16} /></button></div><span className="invite-expiry"><span className="live-dot" />Expires {new Date(invite.expiresAt).toLocaleString()}</span><Button className="subtle wide" onClick={() => { setInvite(null); setUrl(''); }}>Create another invite</Button></div> : <><label className="modal-label">This link expires<select value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>In 1 hour</option><option value={24}>In 24 hours</option><option value={168}>In 7 days</option><option value={720}>In 30 days</option></select></label><div className="invite-safety"><Shield size={14} />You can revoke an invite at any time from the space settings.</div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Not now</Button><Button className="primary" disabled={loading} onClick={create}>{loading ? 'Preparing link…' : 'Create invite link'}<ChevronRight size={15} /></Button></div></>}</Modal>;
}

function FriendModal({ onClose, onAdd }: { onClose: () => void; onAdd: (handle: string) => Promise<void> }) {
  const [handle, setHandle] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  return <Modal title="Find your people." kicker="ADD A FRIEND" onClose={onClose}><div className="friend-add-card"><span><UserPlus size={20} /></span><p>Search for someone by their CORE handle. A private conversation appears when they’re added.</p></div><label className="modal-label">Their CORE handle<div className="input-handle modal-handle"><AtSign size={16} /><input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }} placeholder="theirname" /></div></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><div className="action-spacer" /><Button className="subtle" onClick={onClose}>Cancel</Button><Button className="primary" disabled={!handle.trim() || pending} onClick={async () => { setPending(true); setError(''); try { await onAdd(handle.trim()); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t find that person.'); } finally { setPending(false); } }}>{pending ? 'Looking…' : 'Find person'}<MoveRight size={15} /></Button></div></Modal>;
}

function MembersModal({ server, isOwner, userId, onlineIds, onClose, onToast, onRefresh }: { server: Server; isOwner: boolean; userId: string; onlineIds: string[]; onClose: () => void; onToast: (v: string) => void; onRefresh: () => Promise<void> }) {
  const [invites, setInvites] = useState<Invite[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { api<{ invites: Invite[] }>(`/api/servers/${server.id}`).then(({ invites }) => setInvites(invites)).catch(() => {}); }, [server.id]);
  const setRole = async (member: Member, role: 'admin' | 'member') => { setLoading(true); try { await api(`/api/servers/${server.id}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }); await onRefresh(); onToast(`${member.user.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`); } catch (error) { onToast(error instanceof Error ? error.message : 'Couldn’t update that role.'); } finally { setLoading(false); } };
  const revoke = async (invite: Invite) => { if (!window.confirm('Revoke this invite? Anyone who has the link will no longer be able to use it.')) return; try { await api(`/api/servers/${server.id}/invites/${invite.id}`, { method: 'DELETE' }); setInvites((current) => current.filter((item) => item.id !== invite.id)); onToast('Invite revoked.'); } catch { onToast('Couldn’t revoke this invite.'); } };
  return <Modal title={`${server.name} people`} kicker="YOUR SPACE" onClose={onClose} className="members-modal"><div className="members-manage-toolbar"><div><span className="live-dot" />{server.members?.length || 0} people</div><Button className="subtle small" onClick={async () => { const result = await api<{ url: string }>(`/api/servers/${server.id}/invites`, { method: 'POST', body: JSON.stringify({ expiryHours: 24 }) }); await navigator.clipboard.writeText(result.url); setInvites((current) => [...current, { id: result.url.split('invite=')[1], serverId: server.id, createdAt: Date.now(), expiresAt: Date.now() + 86400000, revokedAt: null }]); onToast('Fresh invite link copied.'); }}><Plus size={14} />Invite</Button></div><div className="members-modal-list">{server.members?.map((member) => <div className="member-manage-row" key={member.userId}><Avatar user={member.user} status /><span><b>{member.user.name}{member.userId === userId && <small className="you-tag">you</small>}</b><small>@{member.user.handle}</small></span><span className={`role-badge ${member.role}`}>{member.role === 'owner' && <Crown size={12} />}{member.role}</span>{isOwner && member.role !== 'owner' && member.userId !== userId && <div className="role-select"><button disabled={loading} onClick={() => setRole(member, member.role === 'admin' ? 'member' : 'admin')}>{member.role === 'admin' ? 'Make member' : 'Make admin'}</button></div>}</div>)}</div>{isOwner && invites.length > 0 && <div className="invite-management"><div className="invite-management-title"><span>ACTIVE INVITES</span><small>Revoke a link any time</small></div>{invites.map((invite) => <div key={invite.id} className="invite-manage-row"><div><code>{invite.id}</code><small>Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></div><button onClick={() => revoke(invite)}>Revoke</button></div>)}</div>}<div className="modal-actions"><div className="action-spacer" /><Button className="primary" onClick={onClose}>Done</Button></div></Modal>;
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

