# Netzplaner Desktop

## Notes

This shit is absolutely vibecoded. Use it or don't.
I personally use it, but I know it still has plenty of problems.

The FilePond and jsPDF browser bundles are included locally,
so importing and PDF export work offline. Use the included
HTML file directly as the source artifact if you want to
review or modify the app UI.

## Description:

A cross-platform network plan editor. The same web app runs on the desktop
through Electron and on Android and iOS through Capacitor.

## Installation:

### Android

Download the Android APK from the latest release and open it on your device.
The automated build is a debug APK, so Android will ask you to allow installing
apps from your browser or file manager.

### iOS

Download the iOS zip from the latest release, unzip it and sign the app with your
Apple developer identity before installing it on a device. The automated build
is unsigned because Apple signing credentials are not stored in this repository.
For development, open the project in Xcode with `npm run cap:open:ios` and run it
on a simulator or a signed device.

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

Install Node.js 22 or newer, then run:

```sh
npm install
npm start
```

Run the persistence regression tests with `npm test` (Node.js built-in test runner; no extra test dependencies required).

Build installers for Windows, MacOS, and Linux with `npm run dist`, or use `npm run dist:win`, `npm run dist:mac`, and `npm run dist:linux` individually. Build each platform on that platform for the best signing and packaging results.

The GitHub Actions workflow in `.github/workflows/release.yml` builds Windows x64, Linux x64/ARM64, MacOS x64/Apple Silicon, an Android debug APK, and an unsigned iOS app on every push to `master`. Once all builds succeed, it publishes a GitHub release tagged for that commit and marks it as the latest release. The workflow requires the repository Actions setting to allow GitHub Actions to create releases (the workflow requests `contents: write`). Android release signing and iOS signing still have to be configured in the native projects before publishing store-ready builds.

## Android and iOS

Capacitor reads the shared web app from `app/`, the same directory Electron loads.
The generated native projects live in `android/` and `ios/`.

```sh
npm install
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```

`npm run cap:open:android` opens Android Studio and `npm run cap:open:ios` opens
Xcode. Use `npm run build:android` for a local debug APK or `npm run build:ios`
for a local simulator build. Android builds require JDK 21 and the Android SDK;
iOS builds require Xcode.

The mobile bridge in `app/native-bridge.js` uses Capacitor Filesystem, Share,
Browser, and App plugins when the app runs natively. It keeps the same
`window.netzplaner` API as the Electron preload script, so project persistence,
recovery, version display, external links, and file exports keep working on
mobile without changing the editor logic.

## Saving and recovery

Edits are written to browser storage immediately and to the app's private user-data folder shortly after each change. The current project is atomically replaced, and every prior distinct saved version is retained under `projects/recovery/` in Electron's user-data directory. There is no project-delete feature. Importing a project or starting a blank project leaves the previous saved version available as a recovery file. The desktop app asks before closing and waits for the final save.

The user-data directory is managed by Electron (for example `%APPDATA%/netzplaner-desktop` on Windows, `~/Library/Application Support/netzplaner-desktop` on MacOS, and `~/.config/netzplaner-desktop` on Linux). For important work, use Export to create an additional portable JSON copy.

On Android and iOS the same autosave and recovery files are kept in the app's private storage through Capacitor Filesystem. Explicit Save and all export actions open the system share sheet so the file can be stored outside the app.
