# Netzplaner Desktop

## Notes

This shit is absolutely vibecoded. Use it or don't.
I personally use it, but I know it still has plenty of problems.

The FilePond and jsPDF browser bundles are included locally,
so importing and PDF export work offline. Use the included
HTML file directly as the source artifact if you want to
review or modify the app UI.

## Description:

A cross-platform Network Planner desktop app. Built with Electron.

## Installation:

### Linux
Launch the .AppImage, your distribution should handle those directly. You may need to make it executable via
```bash
chmod +x <filename>
```

### Windows
Run the Installation .exe and launch via your Windows Search menu.

### MacOS (ARM64 & x86_64)
Download the .dmg for your specific architecture

***Don't know what architecture you are on?***
Click on the Apple icon in the top left of your menu bar and go to -> "About this Mac",
- if you have an Apple M chip, you are on ARM.
- if you have an Intel chip, you are on x86_64 (x64)

Open the .dmg file and drag the Netzplaner Application into the Applications folder.

#### MacOS: App cannot be opened

Since the application is currently not notarized by Apple,
Gatekeeper may prevent it from launching.

After moving Netzplaner to your Applications folder, run:

```bash
xattr -d com.apple.quarantine "/Applications/Netzplaner.app"
```

This removes the quarantine attribute from the Netzplaner Application, enabling it to open without me paying $99 to Apple every year.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

Run the persistence regression tests with `npm test` (Node.js built-in test runner; no extra test dependencies required).

Build installers for Windows, MacOS, and Linux with `npm run dist`, or use `npm run dist:win`, `npm run dist:mac`, and `npm run dist:linux` individually. Build each platform on that platform for the best signing and packaging results.

The GitHub Actions workflow in `.github/workflows/release.yml` builds Windows x64, Linux x64, and MacOS x64/Apple Silicon installers on every push to `master`. Once all builds succeed, it publishes a GitHub release tagged for that commit and marks it as the latest release. The workflow requires the repository Actions setting to allow GitHub Actions to create releases (the workflow requests `contents: write`).

## Saving and recovery

Edits are written to browser storage immediately and to the app's private user-data folder shortly after each change. The current project is atomically replaced, and every prior distinct saved version is retained under `projects/recovery/` in Electron's user-data directory. There is no project-delete feature. Importing a project or starting a blank project leaves the previous saved version available as a recovery file. The app asks before closing and waits for the final save.

The user-data directory is managed by Electron (for example `%APPDATA%/netzplaner-desktop` on Windows, `~/Library/Application Support/netzplaner-desktop` on MacOS, and `~/.config/netzplaner-desktop` on Linux). For important work, use Export to create an additional portable JSON copy.
