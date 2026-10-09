const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db/database');

let win;

async function createWindow() {
  await db.init();

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('renderer/index.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  require('./ipc')(ipcMain, () => win);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
