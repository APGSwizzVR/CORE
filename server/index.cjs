const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { z } = require('zod');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SOUND_BYTES = 10 * 1024 * 1024;
const userSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(32),
  handle: z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9_.-]+$/),
});

function id() { return crypto.randomUUID(); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeUser(user) {
  const { passwordHash, email, ...publicUser } = user;
  return publicUser;
}
function cookieValue(header, name) {
  const item = (header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
function makeSession() { return crypto.randomBytes(32).toString('base64url'); }
function makeServer(ownerId, name = 'The Commons') {
  const serverId = id();
  const channels = [
    { id: id(), serverId, name: 'welcome', kind: 'text', topic: 'A little space to settle in.', category: 'START HERE', slowModeSeconds: 0, private: false, position: 0 },
    { id: id(), serverId, name: 'general', kind: 'text', topic: 'The everyday conversation.', category: 'THE LOUNGE', slowModeSeconds: 0, private: false, position: 1 },
    { id: id(), serverId, name: 'voice lounge', kind: 'voice', topic: 'Drop in when you like.', category: 'THE LOUNGE', slowModeSeconds: 0, private: false, position: 2 },
  ];
  return {
    server: { id: serverId, name, ownerId, createdAt: new Date().toISOString(), icon: null, banner: null, description: 'A welcoming place to talk.' },
    membership: { serverId, userId: ownerId, role: 'owner', joinedAt: new Date().toISOString() },
    channels,
    messages: [
      { id: id(), scope: 'channel', channelId: channels[0].id, serverId, authorId: 'system', author: 'CORE', avatar: null, text: `Welcome to ${name}. This space is yours to shape.`, createdAt: new Date().toISOString(), system: true },
      { id: id(), scope: 'channel', channelId: channels[1].id, serverId, authorId: 'system', author: 'CORE', avatar: null, text: 'Your conversations are ready when you are. Invite someone in, or start with a thought.', createdAt: new Date().toISOString(), system: true },
    ],
  };
}

async function startServer({ port = 4179, host = '127.0.0.1', dataDir = path.join(os.homedir(), '.core-data') } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const uploadDir = path.join(dataDir, 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const dbPath = path.join(dataDir, 'core.json');
  let db;
  try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')); }
  catch { db = { users: [], sessions: [], servers: [], memberships: [], channels: [], messages: [], invites: [], friendships: [], conversations: [] }; }
  for (const key of ['users', 'sessions', 'servers', 'memberships', 'channels', 'messages', 'invites', 'friendships', 'conversations', 'assets', 'friendRequests', 'blocks', 'events', 'reports', 'auditLog']) db[key] ||= [];
  let writeChain = Promise.resolve();
  const save = () => {
    writeChain = writeChain.then(async () => {
      const tmp = `${dbPath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db), { mode: 0o600 });
      await fs.rename(tmp, dbPath);
    });
    return writeChain;
  };
  const app = express();
  const server = http.createServer(app);
  const allowedOrigins = new Set((process.env.CORE_ALLOWED_ORIGINS || 'http://127.0.0.1:4179,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean));
  const originAllowed = (origin) => !origin || allowedOrigins.has(origin) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
  const io = new Server(server, { cors: { origin: (origin, callback) => callback(null, originAllowed(origin)), credentials: true }, maxHttpBufferSize: 1e6, serveClient: true });
  const socketsByUser = new Map();
  const voiceRooms = new Map();
  const slowModeUntil = new Map();
  const authAttempts = new Map();
  const distDir = path.join(__dirname, '..', 'dist');

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss: https: http://127.0.0.1:*; media-src 'self' blob: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    next();
  });
  app.options('/api/*path', (req, res) => res.sendStatus(204));
  app.use(express.json({ limit: '18mb' }));
  app.use('/uploads', express.static(uploadDir, { maxAge: '1d', immutable: true, fallthrough: false }));
  app.use((req, res, next) => {
    if (!['/api/auth/login', '/api/auth/register'].includes(req.path) || req.method !== 'POST') return next();
    const key = req.ip || req.socket.remoteAddress || 'local';
    const attempt = authAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
    if (attempt.count >= 12) return res.status(429).json({ error: 'Too many attempts. Give it a few minutes and try again.' });
    attempt.count += 1; authAttempts.set(key, attempt); next();
  });

  function sessionFor(req) {
    const raw = cookieValue(req.headers.cookie, 'core_session');
    if (!raw) return null;
    const saved = db.sessions.find((item) => item.tokenHash === hash(raw) && item.expiresAt > Date.now());
    if (!saved) return null;
    return db.users.find((user) => user.id === saved.userId) || null;
  }
  function requireAuth(req, res, next) {
    const user = sessionFor(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    req.user = user;
    next();
  }
  function ownsServer(userId, serverId) { return db.memberships.some((m) => m.userId === userId && m.serverId === serverId); }
  function canManage(userId, serverId) { return db.memberships.some((m) => m.userId === userId && m.serverId === serverId && ['owner', 'admin'].includes(m.role)); }
  function canAccessChannel(userId, channel) {
    if (!channel || !ownsServer(userId, channel.serverId)) return false;
    if (!channel.private || canManage(userId, channel.serverId)) return true;
    return (channel.allowedUserIds || []).includes(userId);
  }
  function publicMembers(serverId) {
    return db.memberships.filter((m) => m.serverId === serverId).map((m) => ({ ...m, user: safeUser(db.users.find((u) => u.id === m.userId)) })).filter((m) => m.user);
  }
  function publicConversation(currentUserId, conversation) {
    const members = conversation.memberIds.map((memberId) => db.users.find((item) => item.id === memberId)).filter(Boolean).map(safeUser);
    const otherUser = members.find((item) => item.id !== currentUserId) || members[0];
    return { ...conversation, members, otherUser, isGroup: conversation.memberIds.length > 2, name: conversation.name || (conversation.memberIds.length > 2 ? members.map((item) => item.name).slice(0, 3).join(', ') : otherUser?.name || 'Conversation') };
  }
  function hasFriendship(userId, friendId) { return db.friendships.some((item) => item.userId === userId && item.friendId === friendId); }
  function isBlocked(userId, otherId) { return db.blocks.some((item) => (item.userId === userId && item.blockedId === otherId) || (item.userId === otherId && item.blockedId === userId)); }
  function ensureDm(firstId, secondId) {
    let conversation = db.conversations.find((item) => item.memberIds.length === 2 && item.memberIds.includes(firstId) && item.memberIds.includes(secondId));
    if (!conversation) { conversation = { id: id(), memberIds: [firstId, secondId], createdAt: new Date().toISOString() }; db.conversations.push(conversation); }
    return conversation;
  }
  function bootstrapFor(userId) {
    const servers = db.servers.filter((item) => ownsServer(userId, item.id)).map((item) => ({ ...item, channels: db.channels.filter((channel) => channel.serverId === item.id && canAccessChannel(userId, channel)), members: publicMembers(item.id) }));
    const friends = db.friendships.filter((item) => item.userId === userId).map((item) => safeUser(db.users.find((entry) => entry.id === item.friendId))).filter(Boolean);
    const conversations = db.conversations.filter((item) => item.memberIds.includes(userId)).map((item) => publicConversation(userId, item));
    const incomingRequests = db.friendRequests.filter((item) => item.toUserId === userId && !item.resolvedAt).map((item) => ({ ...item, user: safeUser(db.users.find((entry) => entry.id === item.fromUserId)) }));
    const outgoingRequests = db.friendRequests.filter((item) => item.fromUserId === userId && !item.resolvedAt).map((item) => ({ ...item, user: safeUser(db.users.find((entry) => entry.id === item.toUserId)) }));
    return { user: safeUser(db.users.find((item) => item.id === userId)), servers, friends, conversations, incomingRequests, outgoingRequests };
  }
  function sessionCookie(token, maxAge, secure = false) {
    return `core_session=${encodeURIComponent(token)}; HttpOnly; SameSite=${secure ? 'None' : 'Strict'};${secure ? ' Secure;' : ''} Path=/; Max-Age=${maxAge}`;
  }
  async function createSession(user, res) {
    const token = makeSession();
    db.sessions = db.sessions.filter((s) => s.userId !== user.id || s.expiresAt > Date.now());
    db.sessions.push({ tokenHash: hash(token), userId: user.id, expiresAt: Date.now() + 30 * 86400000 });
    await save();
    const secure = reqSecure(res.req);
    res.setHeader('Set-Cookie', sessionCookie(token, 30 * 86400, secure));
    return safeUser(user);
  }
  function reqSecure(req) { return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https'); }
  function emitPresence(userId) {
    const user = safeUser(db.users.find((u) => u.id === userId));
    if (!user) return;
    const online = (socketsByUser.get(userId)?.size || 0) > 0 && user.status !== 'invisible';
    const peers = new Set(db.friendships.filter((f) => f.userId === userId).map((f) => f.friendId));
    for (const socket of io.sockets.sockets.values()) {
      if (peers.has(socket.data.userId)) socket.emit('presence:update', { userId, online, user });
    }
    const serverIds = new Set(db.memberships.filter((membership) => membership.userId === userId).map((membership) => membership.serverId));
    for (const membership of db.memberships.filter((item) => serverIds.has(item.serverId) && item.userId !== userId)) {
      io.to(`server:${membership.serverId}`).emit('presence:update', { userId, online, user });
    }
  }
  function roomForChannel(channelId) { return `channel:${channelId}`; }
  async function syncChannelRoom(channel) {
    const room = roomForChannel(channel.id);
    io.in(room).socketsLeave(room);
    const clients = [...io.sockets.sockets.values()].filter((socket) => canAccessChannel(socket.data.userId, channel));
    await Promise.all(clients.map((socket) => socket.join(room)));
  }
  async function syncServerRooms(serverId) {
    await Promise.all(db.channels.filter((channel) => channel.serverId === serverId).map(syncChannelRoom));
  }
  function roomForMessage(userId, message) {
    if (message?.scope === 'channel') {
      const channel = db.channels.find((item) => item.id === message.channelId);
      return channel && canAccessChannel(userId, channel) ? roomForChannel(channel.id) : null;
    }
    if (message?.scope === 'dm') {
      const conversation = db.conversations.find((item) => item.id === message.conversationId && item.memberIds.includes(userId));
      return conversation ? `dm:${conversation.id}` : null;
    }
    return null;
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'CORE', mode: process.env.CORE_SERVER_URL ? 'remote' : 'local' }));
  app.get('/api/ice-servers', requireAuth, (req, res) => {
    const stunUrls = (process.env.CORE_STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map((value) => value.trim()).filter(Boolean);
    const iceServers = stunUrls.length ? [{ urls: stunUrls }] : [];
    const turnUrls = (process.env.CORE_TURN_URLS || '').split(',').map((value) => value.trim()).filter(Boolean);
    const turnSecret = process.env.CORE_TURN_SECRET;
    if (turnUrls.length && turnSecret) {
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const username = `${expires}:${req.user.id}`;
      const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }
    res.json({ iceServers });
  });
  app.post('/api/auth/register', async (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check your details and try again.' });
    const { email, password, name, handle } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedHandle = handle.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) return res.status(409).json({ error: 'An account already uses that email.' });
    if (db.users.some((u) => u.handle.toLowerCase() === normalizedHandle)) return res.status(409).json({ error: 'That handle is already taken.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: id(), email: normalizedEmail, name, handle: normalizedHandle, passwordHash: `${salt}:${passwordHash}`, avatar: null, banner: null, bio: 'Finding my people.', status: 'online', theme: 'violet', createdAt: new Date().toISOString() };
    db.users.push(user);
    const initial = makeServer(user.id);
    db.servers.push(initial.server);
    db.memberships.push(initial.membership);
    db.channels.push(...initial.channels);
    db.messages.push(...initial.messages);
    await createSession(user, res);
    res.status(201).json(bootstrapFor(user.id));
  });
  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user || password.length > 128) return res.status(401).json({ error: 'Email or password didn’t match.' });
    const [salt, expected] = user.passwordHash.split(':');
    const actual = await scrypt(password, salt, 64);
    if (!crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return res.status(401).json({ error: 'Email or password didn’t match.' });
    await createSession(user, res);
    res.json(bootstrapFor(user.id));
  });
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const raw = cookieValue(req.headers.cookie, 'core_session');
    db.sessions = db.sessions.filter((s) => s.tokenHash !== hash(raw));
    await save();
    res.setHeader('Set-Cookie', sessionCookie('', 0, reqSecure(req)));
    res.json({ ok: true });
  });
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(bootstrapFor(req.user.id));
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    const name = z.string().trim().min(2).max(32).safeParse(req.body?.name);
    const bio = z.string().trim().max(120).safeParse(req.body?.bio);
    const status = z.enum(['online', 'idle', 'dnd', 'invisible']).safeParse(req.body?.status);
    const theme = z.enum(['violet', 'ocean', 'moss', 'rose', 'light', 'system']).safeParse(req.body?.theme);
    if (!name.success || !bio.success || !status.success || !theme.success) return res.status(400).json({ error: 'Check your profile details.' });
    Object.assign(req.user, { name: name.data, bio: bio.data, status: status.data, theme: theme.data });
    await save();
    emitPresence(req.user.id);
    res.json({ user: safeUser(req.user) });
  });
  app.post('/api/profile/asset', requireAuth, async (req, res) => {
    const { dataUrl, type = 'avatar', serverId } = req.body || {};
    if (!['avatar', 'banner', 'serverIcon', 'serverBanner'].includes(type)) return res.status(400).json({ error: 'Unsupported image type.' });
    if (type.startsWith('server') && (!serverId || !canManage(req.user.id, serverId))) return res.status(403).json({ error: 'Only a server owner or admin can update its images.' });
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP image.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Images must be smaller than 8 MB.' });
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) return res.status(400).json({ error: 'The selected file is not a supported image.' });
    const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
    const filename = `${req.user.id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    const url = `/uploads/${filename}`;
    if (type.startsWith('server')) {
      const target = db.servers.find((s) => s.id === serverId);
      target[type === 'serverIcon' ? 'icon' : 'banner'] = url;
    } else req.user[type] = url;
    await save();
    if (type.startsWith('server')) io.to(`server:${serverId}`).emit('server:updated', { serverId });
    res.json(type.startsWith('server') ? { server: db.servers.find((s) => s.id === serverId) } : { user: safeUser(req.user) });
  });

  app.post('/api/attachments', requireAuth, async (req, res) => {
    const name = z.string().trim().min(1).max(140).safeParse(req.body?.name);
    const match = typeof req.body?.dataUrl === 'string' && req.body.dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!name.success || !match) return res.status(400).json({ error: 'Choose a supported image, video, audio, or document file.' });
    const mime = match[1].toLowerCase();
    const extByMime = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'video/mp4':'mp4', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/ogg':'ogg', 'application/pdf':'pdf', 'text/plain':'txt' };
    if (!extByMime[mime]) return res.status(415).json({ error: 'Use JPG, PNG, WebP, GIF, MP4, WebM, MP3, WAV, OGG, PDF, or text.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Attachments must be smaller than 10 MB.' });
    const valid = {
      'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/webp': bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP',
      'image/gif': ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()),
      'video/mp4': bytes.subarray(4,8).toString() === 'ftyp',
      'video/webm': bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])),
      'audio/mpeg': bytes.subarray(0,3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      'audio/wav': bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WAVE',
      'audio/ogg': bytes.subarray(0,4).toString() === 'OggS',
      'application/pdf': bytes.subarray(0,5).toString() === '%PDF-',
      'text/plain': !bytes.includes(0),
    };
    if (!valid[mime]) return res.status(400).json({ error: 'The file contents do not match the selected file type.' });
    const safeName = name.data.replace(/[\\/\0]/g, '').trim();
    const filename = `${req.user.id}-${crypto.randomBytes(12).toString('hex')}.${extByMime[mime]}`;
    await fs.writeFile(path.join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    res.status(201).json({ attachment: { url: `/uploads/${filename}`, name: safeName, mime, size: bytes.length } });
  });

  app.patch('/api/servers/:serverId', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can change these settings.' });
    const name = z.string().trim().min(2).max(48).safeParse(req.body?.name);
    const description = z.string().trim().max(240).safeParse(req.body?.description);
    if (!name.success || !description.success) return res.status(400).json({ error: 'Use a 2–48 character name and a description up to 240 characters.' });
    const server = db.servers.find((item) => item.id === req.params.serverId);
    if (!server) return res.status(404).json({ error: 'Space not found.' });
    server.name = name.data; server.description = description.data;
    await save();
    io.to(`server:${server.id}`).emit('server:updated', { serverId: server.id });
    res.json({ server });
  });
  app.get('/api/servers/:serverId', requireAuth, (req, res) => {
    if (!ownsServer(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'You do not have access to this server.' });
    const server = db.servers.find((s) => s.id === req.params.serverId);
    res.json({ server, channels: db.channels.filter((c) => c.serverId === server.id && canAccessChannel(req.user.id, c)), members: publicMembers(server.id), invites: canManage(req.user.id, server.id) ? db.invites.filter((i) => i.serverId === server.id && !i.revokedAt) : [] });
  });
  app.post('/api/servers', requireAuth, async (req, res) => {
    const name = z.string().trim().min(2).max(48).safeParse(req.body?.name);
    if (!name.success) return res.status(400).json({ error: 'Server names need 2–48 characters.' });
    const initial = makeServer(req.user.id, name.data);
    db.servers.push(initial.server);
    db.memberships.push(initial.membership);
    db.channels.push(...initial.channels);
    db.messages.push(...initial.messages);
    await save();
    res.status(201).json({ ...initial.server, channels: initial.channels, members: publicMembers(initial.server.id) });
  });
  app.get('/api/servers/:serverId/assets', requireAuth, (req, res) => {
    if (!ownsServer(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'You do not have access to this server.' });
    res.json({ assets: db.assets.filter((asset) => asset.serverId === req.params.serverId) });
  });
  app.post('/api/servers/:serverId/assets', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can add shared assets.' });
    const type = z.enum(['emoji', 'sticker', 'sound']).safeParse(req.body?.type);
    const name = z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N}_-]+$/u).safeParse(req.body?.name);
    if (!type.success || !name.success) return res.status(400).json({ error: 'Choose an asset name with 2–32 letters or numbers.' });
    const match = typeof req.body?.dataUrl === 'string' && req.body.dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'Choose a supported image or audio file.' });
    const mime = match[1].toLowerCase();
    const allowedImage = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
    const allowedSound = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac'].includes(mime);
    if ((type.data === 'sound' && !allowedSound) || (type.data !== 'sound' && !allowedImage)) return res.status(400).json({ error: type.data === 'sound' ? 'Choose an MP3, WAV, OGG, WebM, MP4 or AAC sound.' : 'Choose a JPG, PNG, or WebP image.' });
    const bytes = Buffer.from(match[2], 'base64');
    const maximum = type.data === 'sound' ? MAX_SOUND_BYTES : MAX_IMAGE_BYTES;
    if (!bytes.length || bytes.length > maximum) return res.status(413).json({ error: `Files must be smaller than ${type.data === 'sound' ? '10' : '8'} MB.` });
    const validImage = (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      || (mime === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
    const validSound = (mime.startsWith('audio/') && bytes.length > 12);
    const soundSignatures = {
      'audio/mpeg': bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      'audio/mp3': bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      'audio/wav': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE',
      'audio/x-wav': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE',
      'audio/ogg': bytes.subarray(0, 4).toString() === 'OggS',
      'audio/webm': bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
      'audio/mp4': bytes.subarray(4, 8).toString() === 'ftyp',
      'audio/aac': bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0,
    };
    if (type.data === 'sound' && (!validSound || !soundSignatures[mime])) return res.status(400).json({ error: 'The selected file does not match its file type.' });
    if (type.data !== 'sound' && !validImage) return res.status(400).json({ error: 'The selected file does not match its file type.' });
    if (db.assets.some((asset) => asset.serverId === req.params.serverId && asset.type === type.data && asset.name.toLowerCase() === name.data.toLowerCase())) return res.status(409).json({ error: 'An asset with that name already exists in this space.' });
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac' })[mime];
    const filename = `${req.user.id}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
    await fs.writeFile(path.join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    const asset = { id: id(), serverId: req.params.serverId, type: type.data, name: name.data, url: `/uploads/${filename}`, mime, createdBy: req.user.id, createdAt: new Date().toISOString() };
    db.assets.push(asset); await save();
    res.status(201).json({ asset });
  });
  app.delete('/api/servers/:serverId/assets/:assetId', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can remove shared assets.' });
    const index = db.assets.findIndex((asset) => asset.id === req.params.assetId && asset.serverId === req.params.serverId);
    if (index < 0) return res.status(404).json({ error: 'Asset not found.' });
    const [asset] = db.assets.splice(index, 1);
    try { await fs.unlink(path.join(uploadDir, path.basename(asset.url))); } catch {}
    await save(); res.json({ ok: true });
  });
  app.post('/api/servers/:serverId/channels', requireAuth, async (req, res) => {
    const name = z.string().trim().min(2).max(48).regex(/^[\p{L}\p{N} _-]+$/u).safeParse(req.body?.name);
    const kind = z.enum(['text', 'voice']).safeParse(req.body?.kind);
    const topic = z.string().trim().max(120).safeParse(req.body?.topic ?? '');
    const category = z.string().trim().max(32).safeParse(req.body?.category ?? 'THE LOUNGE');
    const slowModeSeconds = z.number().int().min(0).max(3600).safeParse(req.body?.slowModeSeconds ?? 0);
    const isPrivate = z.boolean().safeParse(req.body?.private ?? false);
    const allowedUserIds = z.array(z.string().min(1).max(80)).max(500).safeParse(req.body?.allowedUserIds ?? []);
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can add channels.' });
    if (!name.success || !kind.success || !topic.success || !category.success || !slowModeSeconds.success || !isPrivate.success || !allowedUserIds.success) return res.status(400).json({ error: 'Check the channel name, topic, category, and slow mode.' });
    if (kind.data === 'voice' && slowModeSeconds.data) return res.status(400).json({ error: 'Slow mode is for text channels.' });
    const serverMemberIds = new Set(db.memberships.filter((membership) => membership.serverId === req.params.serverId).map((membership) => membership.userId));
    if (allowedUserIds.data.some((memberId) => !serverMemberIds.has(memberId))) return res.status(400).json({ error: 'Private channel access can only include current space members.' });
    const channel = { id: id(), serverId: req.params.serverId, name: name.data.toLowerCase(), kind: kind.data, topic: topic.data, category: category.data.toUpperCase() || 'THE LOUNGE', slowModeSeconds: slowModeSeconds.data, private: isPrivate.data, allowedUserIds: isPrivate.data ? [...new Set(allowedUserIds.data)] : [], position: db.channels.filter((c) => c.serverId === req.params.serverId).length };
    db.channels.push(channel);
    await save();
    await syncChannelRoom(channel);
    io.to(`server:${channel.serverId}`).emit('server:channels-updated', { serverId: channel.serverId });
    res.status(201).json({ channel });
  });
  app.patch('/api/channels/:channelId', requireAuth, async (req, res) => {
    const channel = db.channels.find((item) => item.id === req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found.' });
    if (!canManage(req.user.id, channel.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can change channel settings.' });
    const name = z.string().trim().min(2).max(48).regex(/^[\p{L}\p{N} _-]+$/u).safeParse(req.body?.name);
    const topic = z.string().trim().max(120).safeParse(req.body?.topic);
    const category = z.string().trim().max(32).safeParse(req.body?.category);
    const slowModeSeconds = z.number().int().min(0).max(3600).safeParse(req.body?.slowModeSeconds);
    const isPrivate = z.boolean().safeParse(req.body?.private);
    const allowedUserIds = z.array(z.string().min(1).max(80)).max(500).safeParse(req.body?.allowedUserIds);
    if (!name.success || !topic.success || !category.success || !slowModeSeconds.success || !isPrivate.success || !allowedUserIds.success || (channel.kind === 'voice' && slowModeSeconds.data)) return res.status(400).json({ error: 'Check the channel name, topic, category, privacy, and slow mode.' });
    const serverMemberIds = new Set(db.memberships.filter((membership) => membership.serverId === channel.serverId).map((membership) => membership.userId));
    if (allowedUserIds.data.some((memberId) => !serverMemberIds.has(memberId))) return res.status(400).json({ error: 'Private channel access can only include current space members.' });
    Object.assign(channel, { name: name.data.toLowerCase(), topic: topic.data, category: category.data.toUpperCase() || 'THE LOUNGE', slowModeSeconds: slowModeSeconds.data, private: isPrivate.data, allowedUserIds: isPrivate.data ? [...new Set(allowedUserIds.data)] : [] });
    await save();
    await syncChannelRoom(channel);
    io.to(`server:${channel.serverId}`).emit('server:channels-updated', { serverId: channel.serverId });
    res.json({ channel });
  });
  app.patch('/api/servers/:serverId/members/:userId', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can change roles.' });
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Your own role cannot be changed here.' });
    const role = z.enum(['admin', 'member']).safeParse(req.body?.role);
    if (!role.success) return res.status(400).json({ error: 'Choose a valid role.' });
    const member = db.memberships.find((m) => m.serverId === req.params.serverId && m.userId === req.params.userId);
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    member.role = role.data;
    await save();
    await syncServerRooms(req.params.serverId);
    res.json({ member: { ...member, user: safeUser(db.users.find((u) => u.id === member.userId)) } });
  });

  app.post('/api/servers/:serverId/invites', requireAuth, async (req, res) => {
    const expiryHours = z.number().int().min(1).max(720).safeParse(req.body?.expiryHours ?? 24);
    if (!ownsServer(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'You need to be a server member to invite people.' });
    if (!expiryHours.success) return res.status(400).json({ error: 'Invite expiry must be between 1 hour and 30 days.' });
    const invite = { id: crypto.randomBytes(8).toString('base64url'), serverId: req.params.serverId, createdBy: req.user.id, createdAt: Date.now(), expiresAt: Date.now() + expiryHours.data * 3600000, revokedAt: null };
    db.invites.push(invite);
    await save();
    const publicUrl = (process.env.CORE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.status(201).json({ invite, url: `${publicUrl}/?invite=${invite.id}` });
  });
  app.delete('/api/servers/:serverId/invites/:inviteId', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can revoke invites.' });
    const invite = db.invites.find((i) => i.id === req.params.inviteId && i.serverId === req.params.serverId);
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    invite.revokedAt = Date.now();
    await save();
    res.json({ ok: true });
  });
  app.post('/api/invites/:inviteId/accept', requireAuth, async (req, res) => {
    const invite = db.invites.find((i) => i.id === req.params.inviteId);
    if (!invite || invite.revokedAt || invite.expiresAt <= Date.now()) return res.status(410).json({ error: 'This invite has expired or been revoked.' });
    if (!ownsServer(req.user.id, invite.serverId)) db.memberships.push({ serverId: invite.serverId, userId: req.user.id, role: 'member', joinedAt: new Date().toISOString() });
    await save();
    await syncServerRooms(invite.serverId);
    const server = db.servers.find((s) => s.id === invite.serverId);
    res.json({ server: { ...server, channels: db.channels.filter((c) => c.serverId === server.id), members: publicMembers(server.id) } });
  });

  app.post('/api/friends', requireAuth, async (req, res) => {
    const handle = z.string().trim().min(2).max(24).safeParse(req.body?.handle);
    if (!handle.success) return res.status(400).json({ error: 'Enter a valid CORE handle.' });
    const friend = db.users.find((u) => u.handle.toLowerCase() === handle.data.toLowerCase());
    if (!friend || friend.id === req.user.id) return res.status(404).json({ error: 'That person could not be found.' });
    if (isBlocked(req.user.id, friend.id)) return res.status(403).json({ error: 'A privacy setting prevents this friend request.' });
    if (hasFriendship(req.user.id, friend.id)) return res.status(409).json({ error: 'You are already friends.' });
    const reciprocal = db.friendRequests.find((item) => item.fromUserId === friend.id && item.toUserId === req.user.id && !item.resolvedAt);
    if (reciprocal) {
      reciprocal.resolvedAt = Date.now(); reciprocal.acceptedAt = Date.now();
      db.friendships.push({ userId: req.user.id, friendId: friend.id }, { userId: friend.id, friendId: req.user.id });
      const conversation = ensureDm(req.user.id, friend.id);
      await save();
      io.to(`user:${friend.id}`).emit('friend:updated');
      res.status(200).json({ friend: safeUser(friend), accepted: true, conversation: publicConversation(req.user.id, conversation) });
      return;
    }
    let request = db.friendRequests.find((item) => item.fromUserId === req.user.id && item.toUserId === friend.id && !item.resolvedAt);
    if (!request) { request = { id: id(), fromUserId: req.user.id, toUserId: friend.id, createdAt: Date.now(), resolvedAt: null }; db.friendRequests.push(request); }
    await save();
    io.to(`user:${friend.id}`).emit('friend:request');
    res.status(201).json({ friend: safeUser(friend), request });
  });
  app.post('/api/friend-requests/:requestId/accept', requireAuth, async (req, res) => {
    const request = db.friendRequests.find((item) => item.id === req.params.requestId && item.toUserId === req.user.id && !item.resolvedAt);
    if (!request) return res.status(404).json({ error: 'That friend request is no longer available.' });
    if (isBlocked(req.user.id, request.fromUserId)) return res.status(403).json({ error: 'A privacy setting prevents this friend request.' });
    request.resolvedAt = Date.now(); request.acceptedAt = Date.now();
    if (!hasFriendship(req.user.id, request.fromUserId)) db.friendships.push({ userId: req.user.id, friendId: request.fromUserId }, { userId: request.fromUserId, friendId: req.user.id });
    const conversation = ensureDm(req.user.id, request.fromUserId);
    await save(); io.to(`user:${request.fromUserId}`).emit('friend:updated');
    res.json({ friend: safeUser(db.users.find((item) => item.id === request.fromUserId)), conversation: publicConversation(req.user.id, conversation) });
  });
  app.delete('/api/friend-requests/:requestId', requireAuth, async (req, res) => {
    const request = db.friendRequests.find((item) => item.id === req.params.requestId && (item.toUserId === req.user.id || item.fromUserId === req.user.id) && !item.resolvedAt);
    if (!request) return res.status(404).json({ error: 'That friend request is no longer available.' });
    request.resolvedAt = Date.now(); request.dismissedBy = req.user.id;
    await save(); io.to(`user:${request.fromUserId}`).emit('friend:updated'); io.to(`user:${request.toUserId}`).emit('friend:updated');
    res.json({ ok: true });
  });
  app.delete('/api/friends/:friendId', requireAuth, async (req, res) => {
    if (!hasFriendship(req.user.id, req.params.friendId)) return res.status(404).json({ error: 'That friend is not in your circle.' });
    db.friendships = db.friendships.filter((item) => !((item.userId === req.user.id && item.friendId === req.params.friendId) || (item.userId === req.params.friendId && item.friendId === req.user.id)));
    await save(); io.to(`user:${req.params.friendId}`).emit('friend:updated');
    res.json({ ok: true });
  });
  app.post('/api/users/:userId/block', requireAuth, async (req, res) => {
    if (req.params.userId === req.user.id || !db.users.some((item) => item.id === req.params.userId)) return res.status(404).json({ error: 'That person could not be found.' });
    if (!db.blocks.some((item) => item.userId === req.user.id && item.blockedId === req.params.userId)) db.blocks.push({ userId: req.user.id, blockedId: req.params.userId, createdAt: Date.now() });
    db.friendships = db.friendships.filter((item) => !((item.userId === req.user.id && item.friendId === req.params.userId) || (item.userId === req.params.userId && item.friendId === req.user.id)));
    db.friendRequests.forEach((item) => { if ((item.fromUserId === req.user.id && item.toUserId === req.params.userId) || (item.fromUserId === req.params.userId && item.toUserId === req.user.id)) item.resolvedAt ||= Date.now(); });
    await save(); io.to(`user:${req.params.userId}`).emit('friend:updated'); res.json({ ok: true });
  });
  app.delete('/api/users/:userId/block', requireAuth, async (req, res) => {
    db.blocks = db.blocks.filter((item) => !(item.userId === req.user.id && item.blockedId === req.params.userId));
    await save(); res.json({ ok: true });
  });
  app.post('/api/conversations', requireAuth, async (req, res) => {
    const memberIds = z.array(z.string().min(1)).min(2).max(9).safeParse(req.body?.memberIds);
    const name = z.string().trim().min(1).max(48).optional().safeParse(req.body?.name);
    if (!memberIds.success || !name.success) return res.status(400).json({ error: 'Choose between two and nine friends and a group name up to 48 characters.' });
    const uniqueIds = [...new Set([req.user.id, ...memberIds.data])];
    if (uniqueIds.length > 10) return res.status(400).json({ error: 'A group conversation can have up to ten people.' });
    for (const memberId of uniqueIds) {
      if (memberId !== req.user.id && (!hasFriendship(req.user.id, memberId) || isBlocked(req.user.id, memberId))) return res.status(403).json({ error: 'Group conversations can only include your friends.' });
    }
    if (uniqueIds.length < 3) return res.status(400).json({ error: 'Add at least two friends to start a group conversation.' });
    const exactMembers = uniqueIds.slice().sort().join(':');
    let conversation = db.conversations.find((item) => item.memberIds.slice().sort().join(':') === exactMembers);
    if (!conversation) {
      conversation = { id: id(), memberIds: uniqueIds, name: name.data || '', createdAt: new Date().toISOString() };
      db.conversations.push(conversation);
    }
    await save();
    for (const memberId of uniqueIds) {
      for (const socketId of socketsByUser.get(memberId) || []) {
        io.sockets.sockets.get(socketId)?.join(`dm:${conversation.id}`);
        io.to(socketId).emit('dm:created');
      }
    }
    res.status(201).json({ conversation: publicConversation(req.user.id, conversation) });
  });
  app.patch('/api/conversations/:conversationId', requireAuth, async (req, res) => {
    const conversation = db.conversations.find((item) => item.id === req.params.conversationId && item.memberIds.includes(req.user.id));
    if (!conversation || conversation.memberIds.length < 3) return res.status(404).json({ error: 'Group conversation not found.' });
    const name = z.string().trim().min(1).max(48).safeParse(req.body?.name);
    if (!name.success) return res.status(400).json({ error: 'Group names must be between 1 and 48 characters.' });
    conversation.name = name.data; await save();
    for (const memberId of conversation.memberIds) io.to(`user:${memberId}`).emit('dm:created');
    res.json({ conversation: publicConversation(req.user.id, conversation) });
  });
  app.delete('/api/conversations/:conversationId/members/me', requireAuth, async (req, res) => {
    const conversation = db.conversations.find((item) => item.id === req.params.conversationId && item.memberIds.includes(req.user.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    if (conversation.memberIds.length <= 2) return res.status(400).json({ error: 'A private one-to-one conversation can only be closed from your own list.' });
    conversation.memberIds = conversation.memberIds.filter((item) => item !== req.user.id);
    for (const socketId of socketsByUser.get(req.user.id) || []) io.sockets.sockets.get(socketId)?.leave(`dm:${conversation.id}`);
    await save(); io.to(`dm:${conversation.id}`).emit('dm:created'); res.json({ ok: true });
  });
  app.get('/api/search', requireAuth, (req, res) => {
    const query = z.string().trim().min(1).max(120).safeParse(req.query.q);
    if (!query.success) return res.status(400).json({ error: 'Enter a search phrase.' });
    const normalized = query.data.toLocaleLowerCase();
    const author = typeof req.query.author === 'string' ? req.query.author.slice(0, 80).toLocaleLowerCase() : '';
    const before = req.query.before ? new Date(String(req.query.before)).getTime() : Infinity;
    const after = req.query.after ? new Date(String(req.query.after)).getTime() : 0;
    const has = typeof req.query.has === 'string' ? String(req.query.has) : '';
    const readable = db.messages.filter((message) => {
      const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
      const conversation = message.scope === 'dm' ? db.conversations.find((item) => item.id === message.conversationId) : null;
      const allowed = channel ? canAccessChannel(req.user.id, channel) : Boolean(conversation?.memberIds.includes(req.user.id));
      const timestamp = new Date(message.createdAt).getTime();
      return allowed && timestamp <= before && timestamp >= after
        && `${message.text || ''} ${(message.attachments || []).map((item) => item.name).join(' ')}`.toLocaleLowerCase().includes(normalized)
        && (!author || `${message.author} ${message.handle || ''}`.toLocaleLowerCase().includes(author))
        && (!has || (message.attachments || []).some((item) => item.mime.startsWith(`${has}/`) || (has === 'file' && !item.mime.startsWith('image/') && !item.mime.startsWith('video/') && !item.mime.startsWith('audio/'))));
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 60).map((message) => {
      const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
      const server = channel ? db.servers.find((item) => item.id === channel.serverId) : null;
      const conversation = message.scope === 'dm' ? db.conversations.find((item) => item.id === message.conversationId) : null;
      return { ...message, channelName: channel?.name || '', serverId: server?.id || '', serverName: server?.name || '', conversationName: conversation?.name || '' };
    });
    res.json({ results: readable, count: readable.length });
  });
  app.get('/api/channels/:channelId/pins', requireAuth, (req, res) => {
    const channel = db.channels.find((item) => item.id === req.params.channelId);
    if (!channel || !canAccessChannel(req.user.id, channel)) return res.status(403).json({ error: 'You do not have access to this channel.' });
    res.json({ messages: db.messages.filter((item) => item.channelId === channel.id && item.pinnedAt).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt)) });
  });
  app.post('/api/reports', requireAuth, async (req, res) => {
    const messageId = z.string().uuid().safeParse(req.body?.messageId);
    const reason = z.enum(['spam', 'harassment', 'unsafe', 'impersonation', 'other']).safeParse(req.body?.reason);
    const details = z.string().trim().max(500).safeParse(req.body?.details ?? '');
    const message = messageId.success ? db.messages.find((item) => item.id === messageId.data) : null;
    const room = roomForMessage(req.user.id, message);
    if (!message || !room || !reason.success || !details.success) return res.status(400).json({ error: 'Choose a message and a valid reason for your report.' });
    if (message.authorId === req.user.id) return res.status(400).json({ error: 'You cannot report your own message.' });
    const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
    if (!channel) return res.status(400).json({ error: 'Message reports are currently available in spaces.' });
    const duplicate = db.reports.find((item) => item.reporterId === req.user.id && item.messageId === message.id && item.status === 'open');
    if (duplicate) return res.status(409).json({ error: 'You already reported this message.' });
    const report = { id: id(), serverId: channel.serverId, messageId: message.id, reporterId: req.user.id, reportedUserId: message.authorId, reason: reason.data, details: details.data, createdAt: new Date().toISOString(), status: 'open' };
    db.reports.push(report); await save(); io.to(`server:${channel.serverId}`).emit('moderation:report', { serverId: channel.serverId });
    res.status(201).json({ report: { ...report, message: { id: message.id, text: message.text, author: message.author, createdAt: message.createdAt } } });
  });
  app.get('/api/servers/:serverId/reports', requireAuth, (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can review reports.' });
    const reports = db.reports.filter((item) => item.serverId === req.params.serverId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((report) => ({
      ...report,
      reporter: safeUser(db.users.find((item) => item.id === report.reporterId)),
      reportedUser: safeUser(db.users.find((item) => item.id === report.reportedUserId)),
      message: db.messages.find((item) => item.id === report.messageId) ? { id: report.messageId, text: db.messages.find((item) => item.id === report.messageId).text } : null,
      channel: db.channels.find((item) => item.id === db.messages.find((message) => message.id === report.messageId)?.channelId)?.name || 'removed channel',
    }));
    res.json({ reports });
  });
  app.patch('/api/reports/:reportId', requireAuth, async (req, res) => {
    const report = db.reports.find((item) => item.id === req.params.reportId);
    const status = z.enum(['resolved', 'dismissed']).safeParse(req.body?.status);
    if (!report || !status.success) return res.status(404).json({ error: 'Report not found.' });
    if (!canManage(req.user.id, report.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can update reports.' });
    report.status = status.data; report.reviewedAt = new Date().toISOString(); report.reviewedBy = req.user.id;
    await save(); res.json({ report });
  });
  app.get('/api/servers/:serverId/events', requireAuth, (req, res) => {
    if (!ownsServer(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'You do not have access to this space.' });
    const events = db.events.filter((item) => item.serverId === req.params.serverId && Date.parse(item.startsAt) > Date.now() && !item.cancelledAt).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((item) => ({ ...item, attendeeCount: (item.attendeeIds || []).length, attending: (item.attendeeIds || []).includes(req.user.id), createdByUser: safeUser(db.users.find((user) => user.id === item.createdBy)) }));
    res.json({ events });
  });
  app.post('/api/servers/:serverId/events', requireAuth, async (req, res) => {
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can schedule events.' });
    const title = z.string().trim().min(3).max(80).safeParse(req.body?.title);
    const description = z.string().trim().max(500).safeParse(req.body?.description ?? '');
    const startsAt = z.string().datetime().safeParse(req.body?.startsAt);
    const channelId = z.string().max(80).nullable().safeParse(req.body?.channelId ?? null);
    if (!title.success || !description.success || !startsAt.success || !channelId.success) return res.status(400).json({ error: 'Check the event title, description, and start time.' });
    const timestamp = Date.parse(startsAt.data);
    if (timestamp < Date.now() + 60000 || timestamp > Date.now() + 90 * 86400000) return res.status(400).json({ error: 'Schedule events from one minute to 90 days ahead.' });
    const channel = channelId.data ? db.channels.find((item) => item.id === channelId.data && item.serverId === req.params.serverId) : null;
    if (channelId.data && !channel) return res.status(400).json({ error: 'Choose a channel from this space.' });
    const event = { id: id(), serverId: req.params.serverId, title: title.data, description: description.data, startsAt: startsAt.data, channelId: channel?.id || null, locationName: channel?.name || 'A little get-together', createdBy: req.user.id, attendeeIds: [], createdAt: new Date().toISOString() };
    db.events.push(event); await save(); io.to(`server:${event.serverId}`).emit('community:event-updated', { serverId: event.serverId });
    res.status(201).json({ event: { ...event, attendeeCount: 0, attending: false, createdByUser: safeUser(req.user) } });
  });
  app.put('/api/events/:eventId/rsvp', requireAuth, async (req, res) => {
    const event = db.events.find((item) => item.id === req.params.eventId && ownsServer(req.user.id, item.serverId) && !item.cancelledAt);
    const attending = z.boolean().safeParse(req.body?.attending);
    if (!event || !attending.success) return res.status(404).json({ error: 'Event not found.' });
    event.attendeeIds ||= [];
    event.attendeeIds = attending.data ? [...new Set([...event.attendeeIds, req.user.id])] : event.attendeeIds.filter((id) => id !== req.user.id);
    await save(); io.to(`server:${event.serverId}`).emit('community:event-updated', { serverId: event.serverId });
    res.json({ attending: attending.data, attendeeCount: event.attendeeIds.length });
  });
  app.delete('/api/events/:eventId', requireAuth, async (req, res) => {
    const event = db.events.find((item) => item.id === req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!canManage(req.user.id, event.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can cancel events.' });
    event.cancelledAt = new Date().toISOString(); await save();
    io.to(`server:${event.serverId}`).emit('community:event-updated', { serverId: event.serverId }); res.json({ ok: true });
  });
  app.post('/api/messages/:messageId/pin', requireAuth, async (req, res) => {
    const message = db.messages.find((item) => item.id === req.params.messageId);
    const room = roomForMessage(req.user.id, message);
    if (!message || !room) return res.status(404).json({ error: 'Message not found.' });
    const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
    if (channel && !canManage(req.user.id, channel.serverId)) return res.status(403).json({ error: 'Only a server admin can pin channel messages.' });
    message.pinnedAt = Date.now(); message.pinnedBy = req.user.id;
    await save(); io.to(room).emit('chat:update', message); res.json({ message });
  });
  app.delete('/api/messages/:messageId/pin', requireAuth, async (req, res) => {
    const message = db.messages.find((item) => item.id === req.params.messageId);
    const room = roomForMessage(req.user.id, message);
    if (!message || !room) return res.status(404).json({ error: 'Message not found.' });
    const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
    if (channel && !canManage(req.user.id, channel.serverId)) return res.status(403).json({ error: 'Only a server admin can unpin channel messages.' });
    delete message.pinnedAt; delete message.pinnedBy;
    await save(); io.to(room).emit('chat:update', message); res.json({ message });
  });
  app.get('/api/messages/:messageId/thread', requireAuth, (req, res) => {
    const parent = db.messages.find((item) => item.id === req.params.messageId);
    if (!roomForMessage(req.user.id, parent)) return res.status(404).json({ error: 'Message not found.' });
    const replies = db.messages.filter((item) => item.threadParentId === parent.id).slice(-100);
    res.json({ parent: { ...parent, threadReplyCount: replies.length }, messages: replies });
  });
  app.post('/api/polls', requireAuth, async (req, res) => {
    const question = z.string().trim().min(4).max(180).safeParse(req.body?.question);
    const options = z.array(z.string().trim().min(1).max(80)).min(2).max(6).safeParse(req.body?.options);
    if (!question.success || !options.success || new Set(options.data.map((item) => item.toLocaleLowerCase())).size !== options.data.length) return res.status(400).json({ error: 'Polls need a question and two to six unique options.' });
    let room; let message;
    if (req.body?.scope === 'channel') {
      const channel = db.channels.find((item) => item.id === req.body?.channelId && item.kind === 'text');
      if (!channel || !canAccessChannel(req.user.id, channel)) return res.status(403).json({ error: 'You do not have access to this channel.' });
      room = roomForChannel(channel.id); message = { id: id(), scope: 'channel', channelId: channel.id, serverId: channel.serverId };
    } else if (req.body?.scope === 'dm') {
      const conversation = db.conversations.find((item) => item.id === req.body?.conversationId && item.memberIds.includes(req.user.id));
      if (!conversation) return res.status(403).json({ error: 'This conversation is private.' });
      room = `dm:${conversation.id}`; message = { id: id(), scope: 'dm', conversationId: conversation.id };
    } else return res.status(400).json({ error: 'Choose a conversation first.' });
    Object.assign(message, { authorId: req.user.id, author: req.user.name, handle: req.user.handle, avatar: req.user.avatar, text: '', attachments: [], reactions: [], poll: { question: question.data, options: options.data.map((text) => ({ id: id(), text, voterIds: [] })) }, createdAt: new Date().toISOString() });
    db.messages.push(message); await save(); io.to(room).emit('chat:message', message); res.status(201).json({ message });
  });
  app.put('/api/messages/:messageId/poll', requireAuth, async (req, res) => {
    const message = db.messages.find((item) => item.id === req.params.messageId);
    const room = roomForMessage(req.user.id, message);
    const optionId = z.string().min(1).max(80).safeParse(req.body?.optionId);
    if (!message?.poll || !room || !optionId.success) return res.status(404).json({ error: 'Poll not found.' });
    const selected = message.poll.options.find((item) => item.id === optionId.data);
    if (!selected) return res.status(404).json({ error: 'That poll option is no longer available.' });
    for (const option of message.poll.options) option.voterIds = option.voterIds.filter((userId) => userId !== req.user.id);
    selected.voterIds.push(req.user.id); message.poll.updatedAt = new Date().toISOString();
    await save(); io.to(room).emit('chat:update', message); res.json({ message });
  });
  app.get('/api/conversations/:conversationId/messages', requireAuth, (req, res) => {
    const conversation = db.conversations.find((c) => c.id === req.params.conversationId && c.memberIds.includes(req.user.id));
    if (!conversation) return res.status(403).json({ error: 'This conversation is private.' });
    const list = db.messages.filter((m) => m.conversationId === conversation.id && !m.threadParentId);
    const around = typeof req.query.around === 'string' ? list.findIndex((item) => item.id === req.query.around) : -1;
    const page = around >= 0 ? list.slice(Math.max(0, around - 45), around + 55) : list.slice(-100);
    res.json({ messages: page.map((message) => ({ ...message, threadReplyCount: db.messages.filter((item) => item.threadParentId === message.id).length })) });
  });
  app.get('/api/channels/:channelId/messages', requireAuth, (req, res) => {
    const channel = db.channels.find((c) => c.id === req.params.channelId);
    if (!channel || !canAccessChannel(req.user.id, channel)) return res.status(403).json({ error: 'You do not have access to this channel.' });
    const list = db.messages.filter((m) => m.channelId === channel.id && !m.threadParentId);
    const around = typeof req.query.around === 'string' ? list.findIndex((item) => item.id === req.query.around) : -1;
    const page = around >= 0 ? list.slice(Math.max(0, around - 45), around + 55) : list.slice(-100);
    res.json({ messages: page.map((message) => ({ ...message, threadReplyCount: db.messages.filter((item) => item.threadParentId === message.id).length })) });
  });
  app.patch('/api/messages/:messageId', requireAuth, async (req, res) => {
    const message = db.messages.find((item) => item.id === req.params.messageId);
    const room = roomForMessage(req.user.id, message);
    if (!message || !room) return res.status(404).json({ error: 'Message not found.' });
    const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
    if (message.authorId !== req.user.id && !(channel && canManage(req.user.id, channel.serverId))) return res.status(403).json({ error: 'You can only edit your own messages.' });
    const text = z.string().trim().min(1).max(2000).safeParse(req.body?.text);
    if (!text.success) return res.status(400).json({ error: 'Messages need 1–2,000 characters.' });
    message.text = text.data; message.editedAt = new Date().toISOString();
    await save(); io.to(room).emit('chat:update', message);
    res.json({ message });
  });
  app.delete('/api/messages/:messageId', requireAuth, async (req, res) => {
    const index = db.messages.findIndex((item) => item.id === req.params.messageId);
    const message = db.messages[index];
    const room = roomForMessage(req.user.id, message);
    if (!message || !room) return res.status(404).json({ error: 'Message not found.' });
    const channel = message.scope === 'channel' ? db.channels.find((item) => item.id === message.channelId) : null;
    if (message.authorId !== req.user.id && !(channel && canManage(req.user.id, channel.serverId))) return res.status(403).json({ error: 'You can only remove your own messages.' });
    db.messages.splice(index, 1); await save(); io.to(room).emit('chat:delete', { messageId: message.id });
    res.json({ ok: true });
  });
  app.put('/api/messages/:messageId/reactions', requireAuth, async (req, res) => {
    const message = db.messages.find((item) => item.id === req.params.messageId);
    const room = roomForMessage(req.user.id, message);
    if (!message || !room) return res.status(404).json({ error: 'Message not found.' });
    const emoji = z.enum(['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👏']).safeParse(req.body?.emoji);
    if (!emoji.success) return res.status(400).json({ error: 'Choose a supported reaction.' });
    const reactions = message.reactions || [];
    const current = reactions.find((item) => item.emoji === emoji.data);
    if (current?.userIds.includes(req.user.id)) {
      current.userIds = current.userIds.filter((id) => id !== req.user.id);
      if (!current.userIds.length) message.reactions = reactions.filter((item) => item !== current);
    } else if (current) current.userIds.push(req.user.id);
    else message.reactions = [...reactions, { emoji: emoji.data, userIds: [req.user.id] }];
    await save(); io.to(room).emit('chat:update', message);
    res.json({ message });
  });

  io.use((socket, next) => {
    const raw = cookieValue(socket.handshake.headers.cookie, 'core_session');
    const session = db.sessions.find((item) => item.tokenHash === hash(raw) && item.expiresAt > Date.now());
    const user = session && db.users.find((u) => u.id === session.userId);
    if (!user) return next(new Error('Sign in to continue.'));
    socket.data.userId = user.id;
    next();
  });
  io.on('connection', (socket) => {
    const user = db.users.find((u) => u.id === socket.data.userId);
    const sockets = socketsByUser.get(user.id) || new Set();
    sockets.add(socket.id);
    socketsByUser.set(user.id, sockets);
    socket.join(`user:${user.id}`);
    for (const membership of db.memberships.filter((m) => m.userId === user.id)) {
      socket.join(`server:${membership.serverId}`);
      for (const channel of db.channels.filter((item) => item.serverId === membership.serverId && canAccessChannel(user.id, item))) socket.join(roomForChannel(channel.id));
    }
    for (const conversation of db.conversations.filter((c) => c.memberIds.includes(user.id))) socket.join(`dm:${conversation.id}`);
    const serverIds = new Set(db.memberships.filter((membership) => membership.userId === user.id).map((membership) => membership.serverId));
    const visibleIds = new Set([
      ...db.memberships.filter((membership) => serverIds.has(membership.serverId) && membership.userId !== user.id).map((membership) => membership.userId),
      ...db.friendships.filter((friendship) => friendship.userId === user.id).map((friendship) => friendship.friendId),
    ]);
    socket.emit('presence:snapshot', [...visibleIds].filter((userId) => (socketsByUser.get(userId)?.size || 0) > 0 && db.users.find((item) => item.id === userId)?.status !== 'invisible'));
    emitPresence(user.id);
    socket.on('chat:send', async (payload, ack = () => {}) => {
      const text = z.string().trim().max(2000).safeParse(payload?.text ?? '');
      const attachments = z.array(z.object({ url: z.string().min(1).max(220), name: z.string().min(1).max(140), mime: z.string().max(80), size: z.number().int().min(1).max(10 * 1024 * 1024) })).max(5).safeParse(payload?.attachments ?? []);
      if (!text.success || !attachments.success || (!text.data && !attachments.data.length)) return ack({ error: 'Write a message or add up to five supported attachments.' });
      for (const attachment of attachments.data) {
        const filename = path.basename(attachment.url);
        if (attachment.url !== `/uploads/${filename}` || !filename.startsWith(`${user.id}-`) || !(await fs.stat(path.join(uploadDir, filename)).then(() => true).catch(() => false))) return ack({ error: 'One of those attachments is no longer available.' });
      }
      let room; let message;
      if (payload?.scope === 'channel') {
        const channel = db.channels.find((c) => c.id === payload.channelId);
        if (!channel || !canAccessChannel(user.id, channel)) return ack({ error: 'You do not have access to this channel.' });
        if (channel.kind !== 'text') return ack({ error: 'Messages can only be sent in text channels.' });
        const slowModeKey = `${user.id}:${channel.id}`;
        const allowedAt = slowModeUntil.get(slowModeKey) || 0;
        if (allowedAt > Date.now()) return ack({ error: `Slow mode is on. Try again in ${Math.ceil((allowedAt - Date.now()) / 1000)} seconds.` });
        if (channel.slowModeSeconds > 0) slowModeUntil.set(slowModeKey, Date.now() + channel.slowModeSeconds * 1000);
        room = roomForChannel(channel.id);
        message = { id: id(), scope: 'channel', channelId: channel.id, serverId: channel.serverId };
      } else if (payload?.scope === 'dm') {
        const conversation = db.conversations.find((c) => c.id === payload.conversationId && c.memberIds.includes(user.id));
        if (!conversation) return ack({ error: 'This conversation is private.' });
        room = `dm:${conversation.id}`;
        message = { id: id(), scope: 'dm', conversationId: conversation.id };
      } else return ack({ error: 'Choose a conversation first.' });
      if (payload?.threadParentId) {
        const parent = db.messages.find((item) => item.id === payload.threadParentId && !item.threadParentId);
        const sameChannel = message.scope === 'channel' && parent?.scope === 'channel' && parent.channelId === message.channelId;
        const sameConversation = message.scope === 'dm' && parent?.scope === 'dm' && parent.conversationId === message.conversationId;
        if (!parent || (!sameChannel && !sameConversation)) return ack({ error: 'That thread is no longer available.' });
        message.threadParentId = parent.id;
        parent.threadReplyCount = (parent.threadReplyCount || 0) + 1;
      }
      Object.assign(message, { authorId: user.id, author: user.name, handle: user.handle, avatar: user.avatar, text: text.data, attachments: attachments.data, reactions: [], createdAt: new Date().toISOString() });
      db.messages.push(message);
      await save();
      io.to(room).emit('chat:message', message);
      if (message.threadParentId) { const parent = db.messages.find((item) => item.id === message.threadParentId); if (parent) io.to(room).emit('chat:update', parent); }
      ack({ ok: true });
    });
    socket.on('chat:typing', (payload) => {
      let room;
      if (payload?.scope === 'channel') {
        const channel = db.channels.find((c) => c.id === payload.channelId && canAccessChannel(user.id, c));
        if (channel) room = roomForChannel(channel.id);
      } else if (payload?.scope === 'dm') {
        const conversation = db.conversations.find((c) => c.id === payload.conversationId && c.memberIds.includes(user.id));
        if (conversation) room = `dm:${conversation.id}`;
      }
      if (room) socket.to(room).emit('chat:typing', { userId: user.id, name: user.name, typing: Boolean(payload.typing) });
    });
    socket.on('voice:join', (channelId, ack = () => {}) => {
      if (socket.data.voiceChannel) leaveVoice(socket);
      const isDirect = typeof channelId === 'string' && channelId.startsWith('dmvoice:');
      const conversation = isDirect ? db.conversations.find((item) => item.id === channelId.slice(8) && item.memberIds.includes(user.id)) : null;
      const channel = isDirect ? null : db.channels.find((item) => item.id === channelId && item.kind === 'voice' && canAccessChannel(user.id, item));
      if ((isDirect && !conversation) || (!isDirect && !channel)) return ack({ error: 'You do not have access to this voice space.' });
      const roomId = isDirect ? `dmvoice:${conversation.id}` : channel.id;
      const room = voiceRooms.get(roomId) || new Map();
      if (isDirect && conversation.memberIds.length === 2 && room.size >= 2) return ack({ error: 'This private call already has both people in it.' });
      if (isDirect && conversation.memberIds.length > 2 && room.size >= 10) return ack({ error: 'This group call has reached its ten person limit.' });
      const participants = [...room.entries()].map(([socketId, userId]) => { const state = io.sockets.sockets.get(socketId)?.data || {}; return { socketId, user: safeUser(db.users.find((item) => item.id === userId)), cameraOn: Boolean(state.cameraOn), sharing: Boolean(state.sharing) }; });
      socket.join(`voice:${roomId}`);
      socket.data.voiceChannel = roomId;
      socket.data.voiceConversation = conversation?.id || null;
      socket.data.cameraOn = false; socket.data.sharing = false;
      room.set(socket.id, user.id);
      voiceRooms.set(roomId, room);
      ack({ participants });
      socket.to(`voice:${roomId}`).emit('voice:peer-joined', { socketId: socket.id, user: safeUser(user) });
      if (isDirect) io.to(`dm:${conversation.id}`).emit('voice:dm-presence', { conversationId: conversation.id, count: room.size });
      else io.to(`server:${channel.serverId}`).emit('voice:presence', { channelId: channel.id, count: room.size });
    });
    socket.on('voice:media-state', ({ cameraOn, sharing } = {}) => {
      const roomId = socket.data.voiceChannel;
      if (!roomId || !voiceRooms.get(roomId)?.has(socket.id)) return;
      socket.data.cameraOn = Boolean(cameraOn); socket.data.sharing = Boolean(sharing);
      socket.to(`voice:${roomId}`).emit('voice:media-state', { socketId: socket.id, cameraOn: socket.data.cameraOn, sharing: socket.data.sharing });
    });
    socket.on('voice:leave', () => leaveVoice(socket));
    socket.on('voice:signal', ({ target, signal } = {}) => {
      if (!target || !socket.data.voiceChannel) return;
      const room = voiceRooms.get(socket.data.voiceChannel);
      if (!room?.has(target)) return;
      io.to(target).emit('voice:signal', { from: socket.id, signal });
    });
    socket.on('disconnect', () => {
      leaveVoice(socket);
      const active = socketsByUser.get(user.id);
      active?.delete(socket.id);
      if (!active?.size) socketsByUser.delete(user.id);
      emitPresence(user.id);
    });
  });
  function leaveVoice(socket) {
    const channelId = socket.data.voiceChannel;
    if (!channelId) return;
    const conversationId = socket.data.voiceConversation;
    const room = voiceRooms.get(channelId);
    room?.delete(socket.id);
    socket.leave(`voice:${channelId}`);
    socket.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: socket.id });
    socket.data.voiceChannel = null;
    socket.data.voiceConversation = null;
    socket.data.cameraOn = false; socket.data.sharing = false;
    if (room && !room.size) voiceRooms.delete(channelId);
    const channel = db.channels.find((c) => c.id === channelId);
    if (conversationId) io.to(`dm:${conversationId}`).emit('voice:dm-presence', { conversationId, count: room?.size || 0 });
    else if (channel) io.to(`server:${channel.serverId}`).emit('voice:presence', { channelId, count: room?.size || 0 });
  }

  if (await fs.stat(distDir).then(() => true).catch(() => false)) {
    app.use(express.static(distDir));
    app.get('*path', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.status(503).send('CORE is still starting. Start the Vite development server and reload.'));
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : port;
  return { close: () => new Promise((resolve) => io.close(() => server.close(() => resolve()))), url: `http://127.0.0.1:${activePort}`, port: activePort, host };
}

module.exports = { startServer };
