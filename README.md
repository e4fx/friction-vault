# Friction Vault: A Local Password Locker

A standalone, privacy-focused desktop application designed for friction-based password management. Built specifically to set up screen-time and app blockers on mobile devices without consciously remembering or retaining the passcode.
Comparable and a good alternative to https://password-locker.com/ but locally.
This project was made with the assistance of AI.

---

## Core Features

* **Obfuscated Blind Entry System:** Displays step-by-step instructions (TYPE/DELETE decoy patterns) so you can enter a passcode onto a phone or target device without knowing or remembering the final PIN.
* **Two-Phase Confirmation:** Generates two distinct, randomized instruction sequences for initial entry and confirmation re-entry.
* **Timed Friction Delay:** Passcodes cannot be viewed immediately. Unlocking triggers a customizable waiting period (e.g., 20 minutes) to deter impulsive unblocking.
* **Post-View Deletion Safeguard:** Entries can only be deleted after completing the unlock countdown and viewing the passcode.
* **Visual & Speed Controls:** Includes configurable PIN length (default: 4), adjustable autoplay interval speeds (0.5s–3.0s), making retention much harder, and rotating color cues for repeated DELETE instructions.
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

* **Windows:** `dist/Friction Locker 1.0.0.exe` (Portable)
* **macOS:** `dist/Friction Locker 1.0.0.dmg`
* **Linux:** `dist/Friction Locker 1.0.0.AppImage`

---

## Local Data Storage

All encrypted data is stored locally in `vault.json` at the standard OS application data location:

* **Windows:** `%APPDATA%\friction-locker\vault.json`
* **macOS:** `~/Library/Application Support/friction-locker/vault.json`
* **Linux:** `~/.config/friction-locker/vault.json`

*(Deleting `vault.json` directly will completely reset your local storage.)*
