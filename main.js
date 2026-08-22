const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const VAULT_FILE = path.join(app.getPath('userData'), 'vault.json');
const MASTER_KEY = crypto.scryptSync('local-app-secret-salt', 'salt', 32);

function createWindow() {
  const win = new BrowserWindow({
    width: 680,
    height: 850,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), encrypted, authTag };
}

function decrypt(data) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function readVault() {
  if (!fs.existsSync(VAULT_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(VAULT_FILE)); } catch { return []; }
}

function writeVault(data) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2));
}

// Return exact storage path to display in UI
ipcMain.handle('get-vault-path', () => VAULT_FILE);

// Dynamic length numeric passcode generator
ipcMain.handle('generate-pin', (event, length = 4) => {
  const pinLen = parseInt(length, 10) || 4;
  let pin = '';
  for (let i = 0; i < pinLen; i++) {
    pin += crypto.randomInt(0, 10).toString();
  }
  return pin;
});

// Save passcode into vault
ipcMain.handle('save-pin', (event, { label, pin, frictionMinutes }) => {
  const encryptedData = encrypt(pin);
  const vault = readVault();
  
  vault.push({
    id: Date.now().toString(),
    label,
    encryptedData,
    frictionMinutes: parseInt(frictionMinutes, 10) || 20,
    requestedAt: null,
    viewed: false
  });
  
  writeVault(vault);
  return { success: true };
});

ipcMain.handle('get-vault', () => readVault());

ipcMain.handle('start-unlock', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (item && !item.requestedAt) {
    item.requestedAt = Date.now();
    writeVault(vault);
  }
  return vault;
});

ipcMain.handle('get-secret', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (!item || !item.requestedAt) return { error: 'Unlock flow not started.' };

  const elapsedMs = Date.now() - item.requestedAt;
  const requiredMs = item.frictionMinutes * 60 * 1000;

  if (elapsedMs < requiredMs) {
    const remainingSecs = Math.ceil((requiredMs - elapsedMs) / 1000);
    return { error: `Friction timer active. ${remainingSecs}s remaining.` };
  }

  const decrypted = decrypt(item.encryptedData);
  item.viewed = true;
  writeVault(vault);

  return { secret: decrypted };
});

ipcMain.handle('delete-item', (event, id) => {
  let vault = readVault();
  const item = vault.find(i => i.id === id);

  if (!item) return { success: false, error: 'Item not found.' };
  if (!item.viewed) {
    return { success: false, error: 'Deletion blocked: You must complete the delay and view this PIN first.' };
  }

  vault = vault.filter(i => i.id !== id);
  writeVault(vault);
  return { success: true };
});