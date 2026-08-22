# Local Password Locker

A standalone, privacy-focused desktop application designed for friction-based password management. Built specifically to set up screen-time and app blockers on mobile devices without consciously remembering or retaining the passcode.

---

## Core Features

* **Obfuscated Blind Entry System:** Displays step-by-step instructions (TYPE/DELETE decoy patterns) so you can enter a passcode onto a phone or target device without knowing or remembering the final PIN.
* **Buffer-Cap Protection:** Ensures the on-screen active character buffer never exceeds 3 characters during decoy cycles, reaching full length only on the final step to prevent phone lock screens from auto-submitting early.
* **Two-Phase Confirmation:** Generates two distinct, randomized instruction sequences for initial entry and confirmation re-entry.
* **Timed Friction Delay:** Passcodes cannot be viewed immediately. Unlocking triggers a customizable waiting period (e.g., 20 minutes) to deter impulsive unblocking.
* **Post-View Deletion Safeguard:** Entries can only be deleted after completing the unlock countdown and viewing the passcode.
* **Visual & Speed Controls:** Includes configurable PIN length (default: 4), adjustable autoplay interval speeds (0.5s–3.0s), and rotating color cues for repeated DELETE instructions.
* **Local AES-256-GCM Encryption:** Stores all data locally on your computer with zero external server dependencies or online account requirements.

---

## Setup & Running

### Prerequisites

* [Node.js](https://nodejs.org/) (v16 or higher)

### Installation

1. Clone or download this repository.
2. Open a terminal in the project directory and install dependencies:
```bash
npm install

```



### Running Locally

To launch the application in development mode:

```bash
npm start

```

---

## Building a Standalone Executable

To compile the app into a portable executable for your operating system:

```bash
npm run dist

```

The compiled binary will be placed in the `dist/` directory:

* **Windows:** `dist/Local Password Locker.exe` (Portable)
* **macOS:** `dist/Local Password Locker.dmg`
* **Linux:** `dist/Local Password Locker.AppImage`

---

## Local Data Storage

All encrypted data is stored locally in `vault.json` at the standard OS application data location:

* **Windows:** `%APPDATA%\local-password-locker\vault.json`
* **macOS:** `~/Library/Application Support/local-password-locker/vault.json`
* **Linux:** `~/.config/local-password-locker/vault.json`

*(Deleting `vault.json` directly will completely reset your local storage.)*
