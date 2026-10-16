const { app, BrowserWindow, session, desktopCapturer, dialog, shell } = require('electron');
const path = require('node:path');
const { startServer } = require('../server/index.cjs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

let server;

app.whenReady().then(async () => {
  process.env.CORE_DATA_DIR = path.join(app.getPath('userData'), 'data');
  server = await startServer({ port: app.isPackaged ? 0 : 4179, dataDir: process.env.CORE_DATA_DIR });
  const appSession = session.defaultSession;
  appSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'display-capture'].includes(permission));
  });
  appSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    if (!sources.length) return callback({});
    const choice = await dialog.showMessageBox({
      type: 'question',
      title: 'Share your screen',
      message: 'Choose what to share with your call',
      detail: 'CORE shares the selected screen or app window only while you choose to share.',
      buttons: [...sources.map((source) => source.name), 'Cancel'],
      cancelId: sources.length,
      defaultId: 0,
      noLink: true,
    });
    callback(choice.response < sources.length ? { video: sources[choice.response] } : {});
  });

  const win = new BrowserWindow({
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
    },
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
