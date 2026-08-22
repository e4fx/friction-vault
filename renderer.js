const { ipcRenderer } = require('electron');

const labelInput = document.getElementById('labelInput');
const pinLengthInput = document.getElementById('pinLengthInput');
const frictionInput = document.getElementById('frictionInput');
const startWizardBtn = document.getElementById('startWizardBtn');
const formError = document.getElementById('formError');

const wizardModal = document.getElementById('wizardModal');
const phaseBadge = document.getElementById('phaseBadge');
const stepCounter = document.getElementById('stepCounter');
const instructionCard = document.getElementById('instructionCard');
const instructionText = document.getElementById('instructionText');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const autoplayBtn = document.getElementById('autoplayBtn');
const cancelWizardBtn = document.getElementById('cancelWizardBtn');
const autoplayStatus = document.getElementById('autoplayStatus');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const speedWarning = document.getElementById('speedWarning');

const settingsModal = document.getElementById('settingsModal');
const editItemId = document.getElementById('editItemId');
const editLabelInput = document.getElementById('editLabelInput');
const editFrictionInput = document.getElementById('editFrictionInput');
const editFormError = document.getElementById('editFormError');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

const deleteModal = document.getElementById('deleteModal');
const deleteItemId = document.getElementById('deleteItemId');
const deleteWarningText = document.getElementById('deleteWarningText');
const deleteConfirmInput = document.getElementById('deleteConfirmInput');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

const vaultList = document.getElementById('vaultList');
const vaultPathDisplay = document.getElementById('vaultPathDisplay');

let activePin = '';
let sequence = [];
let currentStepIndex = 0;
let currentPhase = 1;
let autoplayTimer = null;
let isCreationMode = true;
let targetDeleteLabel = '';
let lastPromptedDigit = null;
let repeatCount = 0;

const revealedSecrets = {};

function escapeString(str) {
  return str.replace(/'/g, "\\'");
}

function generateObfuscatedSequence(targetPin) {
  const steps = [];
  let currentBufferLength = 0;
  const pinLen = targetPin.length;
  const maxDecoyBuffer = pinLen - 1;

  for (let i = 0; i < pinLen; i++) {
    const realDigit = targetPin[i];
    const numDecoyCycles = Math.floor(Math.random() * 2) + 1;

    for (let c = 0; c < numDecoyCycles; c++) {
      const maxDecoys = maxDecoyBuffer - currentBufferLength;

      if (maxDecoys > 0) {
        const count = Math.floor(Math.random() * maxDecoys) + 1;
        for (let d = 0; d < count; d++) {
          const randDigit = Math.floor(Math.random() * 10).toString();
          steps.push({ type: 'TYPE', value: randDigit });
          currentBufferLength++;
        }
        for (let d = 0; d < count; d++) {
          steps.push({ type: 'DELETE' });
          currentBufferLength--;
        }
      } else if (i > 0) {
        steps.push({ type: 'DELETE' });
        currentBufferLength--;

        const randDigit = Math.floor(Math.random() * 10).toString();
        steps.push({ type: 'TYPE', value: randDigit });
        currentBufferLength++;

        steps.push({ type: 'DELETE' });
        currentBufferLength--;

        steps.push({ type: 'TYPE', value: targetPin[i - 1] });
        currentBufferLength++;
      }
    }

    steps.push({ type: 'TYPE', value: realDigit });
    currentBufferLength++;
  }

  return steps;
}

async function handleSecretAccess(id, mode) {
  const res = await ipcRenderer.invoke('get-secret', id);
  if (res.error) {
    alert(res.error);
    return;
  }

  if (mode === 'blind') {
    // Hide any revealed password elements before launching blind entry
    const passwordDisplay = document.getElementById(`secret-${id}`);
    if (passwordDisplay) passwordDisplay.style.display = 'none';

    startBlindEntry(res.secret);
  } else {
    // Plaintext reveal mode: hide blind entry overlay
    closeBlindEntryModal();
    const passwordDisplay = document.getElementById(`secret-${id}`);
    if (passwordDisplay) {
      passwordDisplay.textContent = res.secret;
      passwordDisplay.style.display = 'block';
    }
  }
}

function updateBlindPrompt(targetDigit) {
  const promptEl = document.getElementById('blind-prompt-text');
  if (!promptEl) return;

  // Track consecutive repeat counts
  if (targetDigit === lastPromptedDigit) {
    repeatCount++;
  } else {
    repeatCount = 1;
    lastPromptedDigit = targetDigit;
  }

  promptEl.textContent = `Type key for: ${targetDigit}`;

  // Apply danger text color if repeated 2 or more times in a row
  if (repeatCount >= 2) {
    promptEl.style.color = '#dc3545'; // Matches red delete button color
    promptEl.style.fontWeight = 'bold';
  } else {
    promptEl.style.color = ''; // Reset to default theme color
    promptEl.style.fontWeight = 'normal';
  }
}

function resetBlindState() {
  lastPromptedDigit = null;
  repeatCount = 0;
}

labelInput.addEventListener('input', () => {
  formError.style.display = 'none';
});

startWizardBtn.addEventListener('click', async () => {
  const label = labelInput.value.trim();
  const length = parseInt(pinLengthInput.value, 10) || 4;

  if (!label) {
    formError.innerText = 'Please enter a blocker name.';
    formError.style.display = 'block';
    setTimeout(() => labelInput.focus(), 50);
    return;
  }

  formError.style.display = 'none';
  labelInput.disabled = true;
  pinLengthInput.disabled = true;
  frictionInput.disabled = true;

  activePin = await ipcRenderer.invoke('generate-pin', length);
  isCreationMode = true;
  currentPhase = 1;
  sequence = generateObfuscatedSequence(activePin);
  currentStepIndex = 0;

  wizardModal.style.display = 'block';
  startWizardBtn.disabled = true;
  renderStep();
});

cancelWizardBtn.addEventListener('click', () => {
  resetWizardState();
});

function resetWizardState() {
  stopAutoplay();
  activePin = '';
  sequence = [];
  currentStepIndex = 0;
  currentPhase = 1;
  isCreationMode = true;

  wizardModal.style.display = 'none';
  startWizardBtn.disabled = false;

  labelInput.disabled = false;
  pinLengthInput.disabled = false;
  frictionInput.disabled = false;

  setTimeout(() => labelInput.focus(), 50);
}

function renderStep() {
  const step = sequence[currentStepIndex];

  if (isCreationMode) {
    if (currentPhase === 1) {
      phaseBadge.innerText = 'PHASE 1: INITIAL ENTRY';
      phaseBadge.style.background = '#1d4ed8';
    } else {
      phaseBadge.innerText = 'PHASE 2: CONFIRMATION ENTRY';
      phaseBadge.style.background = '#7c3aed';
    }
  } else {
    phaseBadge.innerText = 'BLIND RE-ENTRY';
    phaseBadge.style.background = '#059669';
  }

  stepCounter.innerText = `Instruction ${currentStepIndex + 1} of ${sequence.length}`;

  if (step.type === 'TYPE') {
    let consecutiveSameType = 0;
    for (let idx = currentStepIndex; idx >= 0; idx--) {
      if (sequence[idx].type === 'TYPE' && sequence[idx].value === step.value) {
        consecutiveSameType++;
      } else {
        break;
      }
    }

    const colorIndex = (consecutiveSameType - 1) % 3;
    instructionCard.className = `instruction-card type-color-${colorIndex}`;
    instructionText.innerText = `TYPE ${step.value}`;
    instructionText.className = `action-text type-action-${colorIndex}`;
  } else {
    let consecutiveDeletes = 0;
    for (let idx = currentStepIndex; idx >= 0; idx--) {
      if (sequence[idx].type === 'DELETE') consecutiveDeletes++;
      else break;
    }

    const colorIndex = (consecutiveDeletes - 1) % 3;
    instructionCard.className = `instruction-card delete-color-${colorIndex}`;
    instructionText.innerText = 'DELETE';
    instructionText.className = 'action-text';
  }

  prevBtn.disabled = currentStepIndex === 0;

  if (currentStepIndex === sequence.length - 1) {
    if (isCreationMode) {
      nextBtn.innerText = currentPhase === 1 ? 'Next: Start Confirmation' : 'Finish & Save';
    } else {
      nextBtn.innerText = 'Done';
    }
  } else {
    nextBtn.innerText = 'Next Step';
  }
}

nextBtn.addEventListener('click', () => {
  stopAutoplay();
  advanceStep();
});

prevBtn.addEventListener('click', () => {
  stopAutoplay();
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderStep();
  }
});

function updateSpeedUI() {
  const val = parseFloat(speedSlider.value);
  speedValue.innerText = `${val.toFixed(1)}s`;
  if (val >= 1.4) {
    speedWarning.style.display = 'block';
  } else {
    speedWarning.style.display = 'none';
  }
}

speedSlider.addEventListener('input', () => {
  updateSpeedUI();
  if (autoplayTimer) {
    stopAutoplay();
    startAutoplay();
  }
});

autoplayBtn.addEventListener('click', () => {
  if (autoplayTimer) {
    stopAutoplay();
  } else {
    startAutoplay();
  }
});

function advanceStep() {
  if (currentStepIndex < sequence.length - 1) {
    currentStepIndex++;
    renderStep();
  } else {
    if (isCreationMode && currentPhase === 1) {
      currentPhase = 2;
      sequence = generateObfuscatedSequence(activePin);
      currentStepIndex = 0;
      renderStep();
    } else {
      stopAutoplay();
      if (isCreationMode) {
        finishWizard();
      } else {
        resetWizardState();
      }
    }
  }
}

function startAutoplay() {
  const intervalMs = parseFloat(speedSlider.value) * 1000;
  autoplayStatus.style.display = 'inline-block';
  autoplayStatus.innerText = `AUTOPLAY (${speedSlider.value}s)`;
  autoplayBtn.innerText = 'Pause Autoplay';
  autoplayTimer = setInterval(() => {
    advanceStep();
  }, intervalMs);
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  autoplayStatus.style.display = 'none';
  autoplayBtn.innerText = 'Autoplay (RECOMMENDED)';
}

async function finishWizard() {
  await ipcRenderer.invoke('save-pin', {
    label: labelInput.value.trim(),
    pin: activePin,
    frictionMinutes: frictionInput.value
  });

  labelInput.value = '';
  resetWizardState();
  loadVault();
}

window.openSettings = (id, label, frictionMinutes) => {
  deleteModal.style.display = 'none';
  editItemId.value = id;
  editLabelInput.value = label;
  editFrictionInput.value = frictionMinutes;
  editFormError.style.display = 'none';
  settingsModal.style.display = 'block';
};

cancelSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', async () => {
  const id = editItemId.value;
  const label = editLabelInput.value.trim();
  const frictionMinutes = parseInt(editFrictionInput.value, 10);

  if (!label) {
    editFormError.innerText = 'Please enter a blocker name.';
    editFormError.style.display = 'block';
    return;
  }

  const res = await ipcRenderer.invoke('update-item', { id, label, frictionMinutes });
  if (res.success) {
    settingsModal.style.display = 'none';
    loadVault();
  } else {
    editFormError.innerText = res.error || 'Failed to update settings.';
    editFormError.style.display = 'block';
  }
});

window.openDeleteModal = (id, label) => {
  settingsModal.style.display = 'none';
  deleteItemId.value = id;
  targetDeleteLabel = label;
  deleteWarningText.innerText = `Are you sure you want to delete "${label}"? This action is irreversible. Enter "${label}" below to continue:`;
  deleteConfirmInput.value = '';
  confirmDeleteBtn.disabled = true;
  deleteModal.style.display = 'block';
  setTimeout(() => deleteConfirmInput.focus(), 50);
};

deleteConfirmInput.addEventListener('input', () => {
  if (deleteConfirmInput.value.trim() === targetDeleteLabel) {
    confirmDeleteBtn.disabled = false;
  } else {
    confirmDeleteBtn.disabled = true;
  }
});

cancelDeleteBtn.addEventListener('click', () => {
  deleteModal.style.display = 'none';
});

confirmDeleteBtn.addEventListener('click', async () => {
  const id = deleteItemId.value;
  if (deleteConfirmInput.value.trim() !== targetDeleteLabel) return;

  await ipcRenderer.invoke('delete-item', id);
  deleteModal.style.display = 'none';
  delete revealedSecrets[id];
  loadVault();
});

async function loadVault() {
  const items = await ipcRenderer.invoke('get-vault');
  const filePath = await ipcRenderer.invoke('get-vault-path');
  vaultPathDisplay.innerText = `Vault path: ${filePath}`;
  vaultList.innerHTML = '';

  if (items.length === 0) {
    vaultList.innerHTML = '<p class="status">No stored friction passcodes.</p>';
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.style.padding = '12px 0';
    div.style.borderBottom = '1px solid #333';

    let actionHTML = '';
    const requestedAt = item.requestedAt ? Number(item.requestedAt) : null;
    const frictionMinutes = Number(item.frictionMinutes) || 1;
    const elapsedMs = requestedAt ? Date.now() - requestedAt : 0;
    const requiredMs = frictionMinutes * 60 * 1000;
    
    const isUnlocked = item.viewed || (requestedAt && elapsedMs >= requiredMs);

    if (!requestedAt) {
      actionHTML = `<button onclick="startUnlock('${item.id}')">Initiate Unlock (${frictionMinutes}m delay)</button>`;
    } else {
      if (elapsedMs < requiredMs) {
        const remainingTotalSec = Math.ceil((requiredMs - elapsedMs) / 1000);
        const displayMin = Math.floor(remainingTotalSec / 60);
        const displaySec = (remainingTotalSec % 60).toString().padStart(2, '0');

        actionHTML = `
          <span class="status" style="color: #60a5fa; font-weight: 600;">Unlock active: ${displayMin}:${displaySec} remaining</span>
          <button class="secondary" style="margin-left: 8px;" onclick="cancelUnlock('${item.id}')">Cancel</button>
        `;
      } else {
        actionHTML = `
          <button onclick="revealRawPin('${item.id}')">Reveal Raw PIN</button>
          <button class="secondary" style="margin-left: 8px;" onclick="startBlindEntry('${item.id}')">Start Blind Entry</button>
        `;
      }
    }

    const settingsBtn = isUnlocked
      ? `<button class="secondary" style="margin-right: 6px;" onclick="openSettings('${item.id}', '${escapeString(item.label)}', ${item.frictionMinutes})">Settings</button>`
      : `<button class="secondary" style="margin-right: 6px;" disabled title="Not available until unlocked">Settings</button>`;

    const relockBtn = item.requestedAt ? `<button class="secondary" style="margin-right: 6px;" onclick="relockItem('${item.id}')">Relock</button>` : '';
    const deleteBtn = `<button class="danger" onclick="handleDeleteClick('${item.id}', '${encodeURIComponent(item.label)}')" ${!isUnlocked ? 'disabled title="Not available until unlocked"' : ''}>Delete</button>`;
    const secretDisplay = revealedSecrets[item.id] ? `PIN: ${revealedSecrets[item.id]}` : '';

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.label}</strong>
          <div style="margin-top: 4px;">${actionHTML}</div>
        </div>
        <div>${settingsBtn}${relockBtn}${deleteBtn}</div>
      </div>
      <div id="secret-${item.id}" style="color: #4ade80; font-family: monospace; font-size: 1.2em; margin-top: 6px;">${secretDisplay}</div>
    `;
    vaultList.appendChild(div);
  });
}

window.startUnlock = async (id) => {
  await ipcRenderer.invoke('start-unlock', id);
  loadVault();
};

window.cancelUnlock = async (id) => {
  await ipcRenderer.invoke('cancel-unlock', id);
  loadVault();
};

window.relockItem = async (id) => {
  await ipcRenderer.invoke('relock-item', id);
  delete revealedSecrets[id];
  loadVault();
};

window.revealRawPin = async (id) => {
  const res = await ipcRenderer.invoke('get-secret', id);
  if (res.secret) {
    revealedSecrets[id] = res.secret;
    loadVault();
  } else {
    alert(res.error);
  }
};

window.handleDeleteClick = (id, encodedLabel) => {
  const label = decodeURIComponent(encodedLabel);
  openDeleteModal(id, label);
};

window.startBlindEntry = async (id) => {
  const res = await ipcRenderer.invoke('get-secret', id);
  if (!res.secret) {
    alert(res.error);
    return;
  }

  // Prevent PIN from rendering in plain text on background vault list
  delete revealedSecrets[id];
  activePin = res.secret;
  isCreationMode = false;
  currentPhase = 1;
  sequence = generateObfuscatedSequence(activePin);
  currentStepIndex = 0;

  labelInput.disabled = true;
  pinLengthInput.disabled = true;
  frictionInput.disabled = true;

  wizardModal.style.display = 'block';
  startWizardBtn.disabled = true;

  renderStep();
  loadVault();
};

setInterval(() => {
  if (wizardModal.style.display !== 'block' && settingsModal.style.display !== 'block' && deleteModal.style.display !== 'block') {
    loadVault();
  }
}, 1000);

updateSpeedUI();
loadVault();
