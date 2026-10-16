const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('node:path');
const { startServer } = require('../server/index.cjs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

let server;
let win;
let shareSources = [];
let pendingShareSourceId = null;

function isCoreWindow(webContents) {
  return Boolean(win && webContents === win.webContents);
}

function isCoreOrigin(origin = '') {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'file:' || ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  process.env.CORE_DATA_DIR = path.join(app.getPath('userData'), 'data');
  server = await startServer({ port: app.isPackaged ? 0 : 4179, dataDir: process.env.CORE_DATA_DIR });

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#11131a',
    title: 'CORE',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const appSession = win.webContents.session;
  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) =>
    isCoreWindow(webContents) && isCoreOrigin(requestingOrigin)
    && ['media', 'display-capture', 'notifications'].includes(permission));
  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (!isCoreWindow(webContents) || !isCoreOrigin(details?.requestingUrl || webContents.getURL())) return callback(false);
    if (permission === 'media') {
      const mediaTypes = details?.mediaTypes || [];
      return callback(mediaTypes.length === 0 || mediaTypes.some((type) => ['audio', 'video'].includes(type)));
    }
    callback(['display-capture', 'notifications'].includes(permission));
  });

  ipcMain.handle('core:display:sources', async (event) => {
    if (!isCoreWindow(event.sender)) return [];
    shareSources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 300 }, fetchWindowIcons: true });
    return shareSources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      icon: source.appIcon?.isEmpty() ? '' : source.appIcon?.toDataURL() || '',
    }));
  });
  ipcMain.handle('core:display:select', (event, sourceId) => {
    if (!isCoreWindow(event.sender) || typeof sourceId !== 'string') return false;
    const source = shareSources.find((item) => item.id === sourceId);
    if (!source) return false;
    pendingShareSourceId = source.id;
    return true;
  });
  ipcMain.handle('core:windows:privacy', async (event, kind) => {
    if (!isCoreWindow(event.sender)) return false;
    if (process.platform === 'win32') {
      const target = kind === 'camera' ? 'ms-settings:privacy-webcam' : 'ms-settings:privacy-microphone';
      await shell.openExternal(target);
    } else if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy');
    } else {
      await shell.openExternal('https://support.microsoft.com/windows/manage-app-permissions-for-your-camera-in-windows-87ebc757-1f87-7bbf-84b5-0686afb6ca6b');
    }
    return true;
  });
  appSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.frame || request.frame !== request.frame.top || !isCoreWindow(request.frame.webContents)) return callback({});
    const source = shareSources.find((item) => item.id === pendingShareSourceId);
    pendingShareSourceId = null;
    callback(source ? { video: source } : {});
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged ? url.startsWith(server.url) : url.startsWith('http://127.0.0.1:5173');
    if (!allowed) event.preventDefault();
  });
  await win.loadURL(app.isPackaged ? server.url : 'http://127.0.0.1:5173');
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) app.emit('ready');
});
