const { ipcRenderer } = require('electron');

const labelInput = document.getElementById('labelInput');
const pinLengthInput = document.getElementById('pinLengthInput');
const frictionInput = document.getElementById('frictionInput');
const startWizardBtn = document.getElementById('startWizardBtn');

const wizardModal = document.getElementById('wizardModal');
const phaseBadge = document.getElementById('phaseBadge');
const stepCounter = document.getElementById('stepCounter');
const instructionCard = document.getElementById('instructionCard');
const instructionText = document.getElementById('instructionText');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const autoplayBtn = document.getElementById('autoplayBtn');
const autoplayStatus = document.getElementById('autoplayStatus');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const vaultList = document.getElementById('vaultList');
const vaultPathDisplay = document.getElementById('vaultPathDisplay');

let activePin = '';
let sequence = [];
let currentStepIndex = 0;
let currentPhase = 1;
let autoplayTimer = null;

// Dynamically scale max decoy buffer to (pinLength - 1)
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

startWizardBtn.addEventListener('click', async () => {
  const label = labelInput.value.trim();
  const length = parseInt(pinLengthInput.value, 10) || 4;

  if (!label) {
    alert('Please enter a blocker name.');
    return;
  }

  activePin = await ipcRenderer.invoke('generate-pin', length);
  currentPhase = 1;
  sequence = generateObfuscatedSequence(activePin);
  currentStepIndex = 0;

  wizardModal.style.display = 'block';
  startWizardBtn.disabled = true;
  renderStep();
});

function renderStep() {
  const step = sequence[currentStepIndex];

  if (currentPhase === 1) {
    phaseBadge.innerText = 'PHASE 1: INITIAL ENTRY';
    phaseBadge.style.background = '#1d4ed8';
  } else {
    phaseBadge.innerText = 'PHASE 2: CONFIRMATION ENTRY';
    phaseBadge.style.background = '#7c3aed';
  }

  stepCounter.innerText = `Instruction ${currentStepIndex + 1} of ${sequence.length}`;

  if (step.type === 'TYPE') {
    instructionCard.className = 'instruction-card';
    instructionText.innerText = `TYPE ${step.value}`;
    instructionText.className = 'action-text type-action';
  } else {
    // Count consecutive preceding DELETE instructions
    let consecutiveDeletes = 0;
    for (let idx = currentStepIndex; idx >= 0; idx--) {
      if (sequence[idx].type === 'DELETE') consecutiveDeletes++;
      else break;
    }

    // Cycle through 3 distinct visual colors
    const colorIndex = (consecutiveDeletes - 1) % 3;
    instructionCard.className = `instruction-card delete-color-${colorIndex}`;
    instructionText.innerText = `DELETE (${consecutiveDeletes})`;
    instructionText.className = 'action-text';
  }

  prevBtn.disabled = currentStepIndex === 0;

  if (currentStepIndex === sequence.length - 1) {
    nextBtn.innerText = currentPhase === 1 ? 'Next: Start Confirmation' : 'Finish & Save';
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

speedSlider.addEventListener('input', () => {
  speedValue.innerText = `${speedSlider.value}s`;
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
    if (currentPhase === 1) {
      currentPhase = 2;
      sequence = generateObfuscatedSequence(activePin);
      currentStepIndex = 0;
      renderStep();
    } else {
      stopAutoplay();
      finishWizard();
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
  autoplayBtn.innerText = 'Autoplay';
}

async function finishWizard() {
  await ipcRenderer.invoke('save-pin', {
    label: labelInput.value.trim(),
    pin: activePin,
    frictionMinutes: frictionInput.value
  });

  activePin = '';
  sequence = [];
  wizardModal.style.display = 'none';
  startWizardBtn.disabled = false;
  labelInput.value = '';

  loadVault();
}

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
    if (!item.requestedAt) {
      actionHTML = `<button onclick="startUnlock('${item.id}')">Initiate Unlock (${item.frictionMinutes}m delay)</button>`;
    } else {
      const elapsedMs = Date.now() - item.requestedAt;
      const requiredMs = item.frictionMinutes * 60 * 1000;
      if (elapsedMs < requiredMs) {
        const remainingMin = Math.ceil((requiredMs - elapsedMs) / 60000);
        actionHTML = `<span class="status">Unlock active. ~${remainingMin} min remaining.</span>`;
      } else {
        actionHTML = `<button onclick="revealSecret('${item.id}')">Reveal PIN</button>`;
      }
    }

    const deleteBtn = `<button class="danger" onclick="deleteItem('${item.id}')" ${!item.viewed ? 'disabled title="Unlock and view passcode first"' : ''}>Delete</button>`;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.label}</strong>
          <div style="margin-top: 4px;">${actionHTML}</div>
        </div>
        <div>${deleteBtn}</div>
      </div>
      <div id="secret-${item.id}" style="color: #4ade80; font-family: monospace; font-size: 1.2em; margin-top: 6px;"></div>
    `;
    vaultList.appendChild(div);
  });
}

window.startUnlock = async (id) => {
  await ipcRenderer.invoke('start-unlock', id);
  loadVault();
};

window.revealSecret = async (id) => {
  const res = await ipcRenderer.invoke('get-secret', id);
  const secretDiv = document.getElementById(`secret-${id}`);
  if (res.secret) {
    secretDiv.innerText = `PIN: ${res.secret}`;
    loadVault();
  } else {
    secretDiv.innerText = res.error;
  }
};

window.deleteItem = async (id) => {
  const res = await ipcRenderer.invoke('delete-item', id);
  if (res.success) {
    loadVault();
  } else {
    alert(res.error);
  }
};

loadVault();