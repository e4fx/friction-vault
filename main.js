const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure consistent app name across all builds
app.name = 'friction-vault';

const activeUserDataPath = app.getPath('userData');
const vaultPath = path.join(activeUserDataPath, 'vault.json');

// Auto-migrate vault.json from legacy folder names if missing in current folder
function migrateLegacyVault() {
  const migrationFlag = path.join(activeUserDataPath, '.migrated');
  if (fs.existsSync(migrationFlag) || fs.existsSync(vaultPath)) return;

  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library/Application Support') : path.join(process.env.HOME, '.config'));
  
  const legacyFolders = [
    'friction locker',
    'Friction Locker',
    'local-password-locker',
    'Local Password Locker'
  ];

  for (const folder of legacyFolders) {
    const oldPath = path.join(appData, folder, 'vault.json');
    if (fs.existsSync(oldPath) && oldPath !== vaultPath) {
      try {
        if (!fs.existsSync(activeUserDataPath)) {
          fs.mkdirSync(activeUserDataPath, { recursive: true });
        }
        fs.copyFileSync(oldPath, vaultPath);
        fs.writeFileSync(migrationFlag, 'true');
        break;
      } catch (e) {
        console.error(`Failed to migrate vault from ${oldPath}:`, e);
      }
    }
  }
}

migrateLegacyVault();

function readVault() {
  try {
    if (!fs.existsSync(vaultPath)) return [];
    const data = fs.readFileSync(vaultPath, 'utf8');
    const parsed = JSON.parse(data);

    if (Array.isArray(parsed)) return parsed;

    if (typeof parsed === 'object' && parsed !== null) {
      const repaired = Object.values(parsed).every(val => typeof val === 'object' && val !== null)
        ? Object.values(parsed)
        : [parsed];
      writeVault(repaired);
      return repaired;
    }

    return [];
  } catch (e) {
    console.error('Failed to read or parse vault:', e);
    return [];
  }
}

function parseFrictionMinutes(val) {
  const parsed = Math.ceil(parseFloat(val));
  return (!isNaN(parsed) && parsed > 0) ? parsed : 20;
}

function writeVault(data) {
  try {
    const arrayData = Array.isArray(data) ? data : [];
    fs.writeFileSync(vaultPath, JSON.stringify(arrayData, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write vault data:', e);
  }
}

function decryptLegacyItem(item) {
  if (item.pin) return item.pin;
  if (!item.encryptedData) return null;

  const candidateKeys = [
    'local-password-locker',
    'friction-vault',
    'friction locker',
    'Local Password Locker',
    'Friction Vault',
    'secret-key',
    'secret',
    'master-key',
    item.label || ''
  ];

  for (const str of candidateKeys) {
    const keySha = crypto.createHash('sha256').update(str).digest();
    const keyScrypt = crypto.scryptSync(str, 'salt', 32);
    const keyPad = Buffer.alloc(32, str);

    for (const key of [keySha, keyScrypt, keyPad]) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(item.encryptedData.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(item.encryptedData.authTag, 'hex'));
        let dec = decipher.update(item.encryptedData.encrypted, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
      } catch (e) {}
    }
  }
  return null;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 750,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers

ipcMain.handle('get-vault-path', () => {
  return vaultPath;
});

ipcMain.handle('get-vault', () => {
  const vault = readVault();
  return vault.map(item => ({
    id: item.id,
    label: item.label,
    frictionMinutes: item.frictionMinutes,
    requestedAt: item.requestedAt,
    viewed: item.viewed
  }));
});

ipcMain.handle('generate-pin', (event, length = 4) => {
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += Math.floor(Math.random() * 10).toString();
  }
  return pin;
});

ipcMain.handle('save-pin', (event, { label, pin, frictionMinutes }) => {
  const vault = readVault();
  const newItem = {
    id: Date.now().toString(),
    label,
    pin,
    frictionMinutes: parseFrictionMinutes(frictionMinutes),
    requestedAt: null,
    viewed: false
  };
  vault.push(newItem);
  writeVault(vault);
  return { success: true };
});

ipcMain.handle('update-item', (event, { id, label, frictionMinutes }) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (!item) return { success: false, error: 'Item not found' };

  item.label = label;
  item.frictionMinutes = parseFrictionMinutes(frictionMinutes);
  writeVault(vault);
  return { success: true };
});

ipcMain.handle('delete-item', (event, id) => {
  let vault = readVault();
  const item = vault.find(i => i.id === id);
  if (!item) return { success: false, error: 'Item not found' };

  vault = vault.filter(i => i.id !== id);
  writeVault(vault);
  return { success: true };
});

ipcMain.handle('start-unlock', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (item) {
    item.requestedAt = Date.now();
    writeVault(vault);
  }
  return { success: true };
});

ipcMain.handle('cancel-unlock', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (item) {
    item.requestedAt = null;
    writeVault(vault);
  }
  return { success: true };
});

ipcMain.handle('relock-item', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (item) {
    item.requestedAt = null;
    item.viewed = false;
    writeVault(vault);
  }
  return { success: true };
});

ipcMain.handle('get-secret', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (!item) return { error: 'Item not found' };

  const elapsedMs = item.requestedAt ? Date.now() - Number(item.requestedAt) : 0;
  const requiredMs = (Number(item.frictionMinutes) || 1) * 60 * 1000;
  const isUnlocked = item.viewed || (item.requestedAt && elapsedMs >= requiredMs);

  if (!isUnlocked) {
    return { error: 'Unlock timer has not completed.' };
  }

  const secret = decryptLegacyItem(item);
  if (!secret) return { error: 'Failed to decrypt passcode.' };

  item.viewed = true;
  item.pin = secret;
  writeVault(vault);
  return { secret };
});
