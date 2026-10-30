# Netzplaner Desktop

## Note:

This shit is absolutely vibecoded, use or dont.

## Description:

A cross-platform Electron desktop app based on the supplied Netzplaner HTML. The original German interface and canvas editor are retained.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

Run the persistence regression tests with `npm test` (Node.js built-in test runner; no extra test dependencies required).

Build installers for Windows, macOS, and Linux with `npm run dist`, or use `npm run dist:win`, `npm run dist:mac`, and `npm run dist:linux` individually. Build each platform on that platform for the best signing and packaging results.

The GitHub Actions workflow in `.github/workflows/release.yml` builds Windows x64, Linux x64, and macOS x64/Apple Silicon installers on every push to `master`. Once all builds succeed, it publishes a GitHub release tagged for that commit and marks it as the latest release. The workflow requires the repository Actions setting to allow GitHub Actions to create releases (the workflow requests `contents: write`).

## Saving and recovery

Edits are written to browser storage immediately and to the app's private user-data folder shortly after each change. The current project is atomically replaced, and every prior distinct saved version is retained under `projects/recovery/` in Electron's user-data directory. There is no project-delete feature. Importing a project or starting a blank project leaves the previous saved version available as a recovery file. The app asks before closing and waits for the final save.

The user-data directory is managed by Electron (for example `%APPDATA%/netzplaner-desktop` on Windows, `~/Library/Application Support/netzplaner-desktop` on macOS, and `~/.config/netzplaner-desktop` on Linux). For important work, use Export to create an additional portable JSON copy.

## Notes

The FilePond and jsPDF browser bundles are included locally, so importing and PDF export work offline. Use the included HTML file directly as the source artifact if you want to review or modify the app UI.
