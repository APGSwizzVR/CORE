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
    { id: id(), serverId, name: 'welcome', kind: 'text', topic: 'A little space to settle in.', position: 0 },
    { id: id(), serverId, name: 'general', kind: 'text', topic: 'The everyday conversation.', position: 1 },
    { id: id(), serverId, name: 'voice lounge', kind: 'voice', topic: 'Drop in when you like.', position: 2 },
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
  for (const key of ['users', 'sessions', 'servers', 'memberships', 'channels', 'messages', 'invites', 'friendships', 'conversations', 'assets']) db[key] ||= [];
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
  app.use(express.json({ limit: '16mb' }));
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
  function publicMembers(serverId) {
    return db.memberships.filter((m) => m.serverId === serverId).map((m) => ({ ...m, user: safeUser(db.users.find((u) => u.id === m.userId)) })).filter((m) => m.user);
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
    const safe = await createSession(user, res);
    res.status(201).json({ user: safe, servers: db.servers.filter((s) => ownsServer(user.id, s.id)).map((s) => ({ ...s, channels: db.channels.filter((c) => c.serverId === s.id), members: publicMembers(s.id) })) });
  });
  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user || password.length > 128) return res.status(401).json({ error: 'Email or password didn’t match.' });
    const [salt, expected] = user.passwordHash.split(':');
    const actual = await scrypt(password, salt, 64);
    if (!crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return res.status(401).json({ error: 'Email or password didn’t match.' });
    const safe = await createSession(user, res);
    res.json({ user: safe, servers: db.servers.filter((s) => ownsServer(user.id, s.id)).map((s) => ({ ...s, channels: db.channels.filter((c) => c.serverId === s.id), members: publicMembers(s.id) })) });
  });
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const raw = cookieValue(req.headers.cookie, 'core_session');
    db.sessions = db.sessions.filter((s) => s.tokenHash !== hash(raw));
    await save();
    res.setHeader('Set-Cookie', sessionCookie('', 0, reqSecure(req)));
    res.json({ ok: true });
  });
  app.get('/api/auth/me', requireAuth, (req, res) => {
    const servers = db.servers.filter((s) => ownsServer(req.user.id, s.id)).map((s) => ({ ...s, channels: db.channels.filter((c) => c.serverId === s.id), members: publicMembers(s.id) }));
    const friends = db.friendships.filter((f) => f.userId === req.user.id).map((f) => safeUser(db.users.find((u) => u.id === f.friendId))).filter(Boolean);
    const conversations = db.conversations.filter((c) => c.memberIds.includes(req.user.id)).map((c) => ({ ...c, otherUser: safeUser(db.users.find((u) => u.id === c.memberIds.find((x) => x !== req.user.id))) }));
    res.json({ user: safeUser(req.user), servers, friends, conversations });
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    const name = z.string().trim().min(2).max(32).safeParse(req.body?.name);
    const bio = z.string().trim().max(120).safeParse(req.body?.bio);
    const status = z.enum(['online', 'idle', 'dnd', 'invisible']).safeParse(req.body?.status);
    const theme = z.enum(['violet', 'ocean', 'moss', 'rose']).safeParse(req.body?.theme);
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
    res.json(type.startsWith('server') ? { server: db.servers.find((s) => s.id === serverId) } : { user: safeUser(req.user) });
  });

  app.get('/api/servers/:serverId', requireAuth, (req, res) => {
    if (!ownsServer(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'You do not have access to this server.' });
    const server = db.servers.find((s) => s.id === req.params.serverId);
    res.json({ server, channels: db.channels.filter((c) => c.serverId === server.id), members: publicMembers(server.id), invites: canManage(req.user.id, server.id) ? db.invites.filter((i) => i.serverId === server.id && !i.revokedAt) : [] });
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
    if (!canManage(req.user.id, req.params.serverId)) return res.status(403).json({ error: 'Only a server owner or admin can add channels.' });
    if (!name.success || !kind.success) return res.status(400).json({ error: 'Check the channel name and type.' });
    const channel = { id: id(), serverId: req.params.serverId, name: name.data.toLowerCase(), kind: kind.data, topic: '', position: db.channels.filter((c) => c.serverId === req.params.serverId).length };
    db.channels.push(channel);
    await save();
    res.status(201).json({ channel });
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
    const server = db.servers.find((s) => s.id === invite.serverId);
    res.json({ server: { ...server, channels: db.channels.filter((c) => c.serverId === server.id), members: publicMembers(server.id) } });
  });

  app.post('/api/friends', requireAuth, async (req, res) => {
    const handle = z.string().trim().min(2).max(24).safeParse(req.body?.handle);
    if (!handle.success) return res.status(400).json({ error: 'Enter a valid CORE handle.' });
    const friend = db.users.find((u) => u.handle.toLowerCase() === handle.data.toLowerCase());
    if (!friend || friend.id === req.user.id) return res.status(404).json({ error: 'That person could not be found.' });
    const existing = db.conversations.find((c) => c.memberIds.includes(friend.id) && c.memberIds.includes(req.user.id));
    if (!existing) {
      const conversation = { id: id(), memberIds: [req.user.id, friend.id], createdAt: new Date().toISOString() };
      db.conversations.push(conversation);
      db.friendships.push({ userId: req.user.id, friendId: friend.id }, { userId: friend.id, friendId: req.user.id });
    }
    await save();
    res.status(201).json({ friend: safeUser(friend) });
  });
  app.get('/api/conversations/:conversationId/messages', requireAuth, (req, res) => {
    const conversation = db.conversations.find((c) => c.id === req.params.conversationId && c.memberIds.includes(req.user.id));
    if (!conversation) return res.status(403).json({ error: 'This conversation is private.' });
    res.json({ messages: db.messages.filter((m) => m.conversationId === conversation.id).slice(-100) });
  });
  app.get('/api/channels/:channelId/messages', requireAuth, (req, res) => {
    const channel = db.channels.find((c) => c.id === req.params.channelId);
    if (!channel || !ownsServer(req.user.id, channel.serverId)) return res.status(403).json({ error: 'You do not have access to this channel.' });
    res.json({ messages: db.messages.filter((m) => m.channelId === channel.id).slice(-100) });
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
    for (const membership of db.memberships.filter((m) => m.userId === user.id)) {
      socket.join(`server:${membership.serverId}`);
      for (const channel of db.channels.filter((item) => item.serverId === membership.serverId)) socket.join(roomForChannel(channel.id));
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
      const text = z.string().trim().min(1).max(2000).safeParse(payload?.text);
      if (!text.success) return ack({ error: 'Messages can be up to 2,000 characters.' });
      let room; let message;
      if (payload?.scope === 'channel') {
        const channel = db.channels.find((c) => c.id === payload.channelId);
        if (!channel || !ownsServer(user.id, channel.serverId)) return ack({ error: 'You do not have access to this channel.' });
        room = roomForChannel(channel.id);
        message = { id: id(), scope: 'channel', channelId: channel.id, serverId: channel.serverId };
      } else if (payload?.scope === 'dm') {
        const conversation = db.conversations.find((c) => c.id === payload.conversationId && c.memberIds.includes(user.id));
        if (!conversation) return ack({ error: 'This conversation is private.' });
        room = `dm:${conversation.id}`;
        message = { id: id(), scope: 'dm', conversationId: conversation.id };
      } else return ack({ error: 'Choose a conversation first.' });
      Object.assign(message, { authorId: user.id, author: user.name, handle: user.handle, avatar: user.avatar, text: text.data, createdAt: new Date().toISOString() });
      db.messages.push(message);
      await save();
      io.to(room).emit('chat:message', message);
      ack({ ok: true });
    });
    socket.on('chat:typing', (payload) => {
      let room;
      if (payload?.scope === 'channel') {
        const channel = db.channels.find((c) => c.id === payload.channelId && ownsServer(user.id, c.serverId));
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
      const channel = isDirect ? null : db.channels.find((item) => item.id === channelId && item.kind === 'voice' && ownsServer(user.id, item.serverId));
      if ((isDirect && !conversation) || (!isDirect && !channel)) return ack({ error: 'You do not have access to this voice space.' });
      const roomId = isDirect ? `dmvoice:${conversation.id}` : channel.id;
      const room = voiceRooms.get(roomId) || new Map();
      if (isDirect && room.size >= 2) return ack({ error: 'This private call already has both people in it.' });
      const participants = [...room.entries()].map(([socketId, userId]) => ({ socketId, user: safeUser(db.users.find((item) => item.id === userId)) }));
      socket.join(`voice:${roomId}`);
      socket.data.voiceChannel = roomId;
      socket.data.voiceConversation = conversation?.id || null;
      room.set(socket.id, user.id);
      voiceRooms.set(roomId, room);
      ack({ participants });
      socket.to(`voice:${roomId}`).emit('voice:peer-joined', { socketId: socket.id, user: safeUser(user) });
      if (isDirect) io.to(`dm:${conversation.id}`).emit('voice:dm-presence', { conversationId: conversation.id, count: room.size });
      else io.to(`server:${channel.serverId}`).emit('voice:presence', { channelId: channel.id, count: room.size });
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
