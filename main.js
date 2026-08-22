const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const vaultPath = path.join(app.getPath('userData'), 'vault.json');

// --- Encryption Setup ---
const ENCRYPTION_KEY = crypto.scryptSync('local-friction-locker-secret-key', 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), encryptedData: encrypted, authTag };
}

function decrypt(encryptedObj) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(encryptedObj.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));
  let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- Vault I/O Helpers ---
function readVault() {
  if (!fs.existsSync(vaultPath)) return [];
  try {
    const raw = fs.readFileSync(vaultPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeVault(data) {
  fs.writeFileSync(vaultPath, JSON.stringify(data, null, 2), 'utf8');
}

// --- Window Creation ---
function createWindow() {
  const win = new BrowserWindow({
    width: 680,
    height: 850,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.handle('get-vault-path', () => vaultPath);

ipcMain.handle('generate-pin', (event, length) => {
  const pinLength = length || 4;
  let pin = '';
  for (let i = 0; i < pinLength; i++) {
    pin += crypto.randomInt(0, 10).toString();
  }
  return pin;
});

ipcMain.handle('save-pin', (event, { label, pin, frictionMinutes }) => {
  const vault = readVault();
  const encryptedPin = encrypt(pin);

  const newItem = {
    id: crypto.randomUUID(),
    label,
    encryptedPin,
    frictionMinutes: parseInt(frictionMinutes, 10) || 20,
    requestedAt: null,
    viewed: false
  };

  vault.push(newItem);
  writeVault(vault);
  return { success: true };
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

ipcMain.handle('start-unlock', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);
  if (item && !item.requestedAt) {
    item.requestedAt = Date.now();
    writeVault(vault);
  }
  return { success: true };
});

ipcMain.handle('get-secret', (event, id) => {
  const vault = readVault();
  const item = vault.find(i => i.id === id);

  if (!item) return { error: 'Item not found' };
  if (!item.requestedAt) return { error: 'Unlock not requested' };

  const elapsedMs = Date.now() - item.requestedAt;
  const requiredMs = item.frictionMinutes * 60 * 1000;

  if (elapsedMs < requiredMs) {
    return { error: 'Friction delay still active' };
  }

  item.viewed = true;
  writeVault(vault);

  try {
    const secret = decrypt(item.encryptedPin);
    return { secret };
  } catch (err) {
    return { error: 'Decryption failed' };
  }
});

ipcMain.handle('delete-item', (event, id) => {
  let vault = readVault();
  const item = vault.find(i => i.id === id);

  if (!item) return { success: false, error: 'Item not found' };
  if (!item.viewed) return { success: false, error: 'Item must be unlocked and viewed before deletion' };

  vault = vault.filter(i => i.id !== id);
  writeVault(vault);
  return { success: true };
});
