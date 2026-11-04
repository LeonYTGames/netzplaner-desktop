# Netzplaner Desktop

## Notes

This shit is absolutely vibecoded. Use it or don't.
I personally use it, but I know it still has plenty of problems.

The FilePond and jsPDF browser bundles are included locally,
so importing and PDF export work offline. Use the included
HTML file directly as the source artifact if you want to
review or modify the app UI.

## Description

A cross-platform network plan editor. The same web app runs on the desktop
through Electron and on Android and iOS through Capacitor.

Nodes can be selected one at a time, or several at once with
`Shift`/`Ctrl`/`Cmd` + click or by dragging a selection box on the canvas.
Dragging one selected node moves the whole selection, and any change made in
the inspector is applied to every selected node.

## Download assets

Every release publishes the same set of assets:

| Platform | Architecture | Asset |
| --- | --- | --- |
| Windows | x64 | `Netzplaner-<version>-x64.exe` |
| Windows | ARM64 | `Netzplaner-<version>-arm64.exe` |
| Windows | x64, portable | `Netzplaner-<version>-x64-portable.exe` |
| Windows | ARM64, portable | `Netzplaner-<version>-arm64-portable.exe` |
| macOS | Apple Silicon | `Netzplaner-<version>-arm64.dmg` |
| macOS | Apple Silicon, zip | `Netzplaner-<version>-arm64.zip` |
| macOS | Intel | `Netzplaner-<version>-x64.dmg` |
| macOS | Intel, zip | `Netzplaner-<version>-x64.zip` |
| Linux | x64 | `Netzplaner-<version>-x64.AppImage` |
| Linux | ARM64 | `Netzplaner-<version>-arm64.AppImage` |
| Android | universal | `Netzplaner-<version>-android-universal.apk` |
| iOS | arm64 | `Netzplaner-<version>-ios-arm64.zip` |

Desktop assets follow `Netzplaner-<version>-<architecture>.<extension>`.
Mobile assets include the platform as well, because the iOS zip would otherwise
collide with the macOS zip.

## Installation

### Windows (x64 / ARM64)

1. Download the `.exe` for your architecture.
2. Run the file. The regular `.exe` installs Netzplaner and adds it to the
   Windows Search menu; the `-portable.exe` runs without installing.
3. If Windows SmartScreen appears, click **More info** and then **Run anyway**.
   The builds are not code-signed.

***Don't know what architecture you are on?***
Open **Settings → System → About** and look at **System type**:

- `x64-based processor` means you need **x64**.
- `ARM-based processor` means you need **ARM64**.

### macOS (Apple Silicon / Intel)

1. Download the `.dmg` (or the `.zip`) that matches your Mac.
2. Open the `.dmg` and drag **Netzplaner** into the Applications folder.
3. Launch it from Applications or Spotlight.

***Don't know what architecture you are on?***
Click the Apple icon in the top left of your menu bar and go to **About this Mac**:

- An **Apple M** chip (M1, M2, M3, M4, ...) means you need **arm64**.
- An **Intel** chip means you need **x64**.

#### macOS: the app cannot be opened

Since the application is currently not notarized by Apple, Gatekeeper may
prevent it from launching. After moving Netzplaner to your Applications folder,
run:

```bash
xattr -d com.apple.quarantine "/Applications/Netzplaner.app"
```

This removes the quarantine attribute from the Netzplaner application, enabling
it to open without paying Apple $99 every year.

### Linux (x64 / ARM64)

1. Download the `.AppImage` for your architecture.
2. Make it executable and run it:

```bash
chmod +x Netzplaner-<version>-<architecture>.AppImage
./Netzplaner-<version>-<architecture>.AppImage
```

Most distributions can also launch the AppImage directly from the file manager
once it is executable. If the AppImage refuses to start because of FUSE, either
install `libfuse2` (Debian/Ubuntu: `sudo apt install libfuse2`) or run it with
`--appimage-extract-and-run`.

***Don't know what architecture you are on?***
Run `uname -m` in a terminal:

- `x86_64` means you need **x64**.
- `aarch64` or `arm64` means you need **ARM64**.

### Android (universal)

1. Download `Netzplaner-<version>-android-universal.apk` on your device.
2. Open the downloaded file. Android asks you to allow installing apps from the
   app you opened it with (browser or file manager); allow it and confirm the
   installation.
3. Launch Netzplaner from your app drawer.

The same APK runs on every supported Android architecture, so there is no
separate ARM or x86 download. Installing the APK manually means you update it
by downloading a newer APK, not through an app store.

### iOS (arm64)

1. Download `Netzplaner-<version>-ios-arm64.zip` on a Mac.
2. Unzip it to get `App.app`.
3. The app is unsigned because Apple signing credentials are not stored in this
   repository, so iOS will not install it as-is. Sign it with your Apple
   developer identity (for example with Xcode, or with `codesign` and your own
   provisioning profile) and then install it on your device.

For development, open the project in Xcode with `npm run cap:open:ios` and run
it on a simulator or a signed device.

## Run from source

Install Node.js 22 or newer, then run:

```sh
npm install
npm start
```

Run the persistence regression tests with `npm test` (Node.js built-in test runner; no extra test dependencies required).

Build installers for Windows, MacOS, and Linux with `npm run dist`, or use `npm run dist:win`, `npm run dist:mac`, and `npm run dist:linux` individually. Build each platform on that platform for the best signing and packaging results.

The GitHub Actions workflow in `.github/workflows/release.yml` builds Windows x64/ARM64, Linux x64/ARM64, MacOS x64/Apple Silicon, an Android APK, and an unsigned iOS app on every push to `master`. Once all builds succeed, it publishes a GitHub release tagged for that commit and marks it as the latest release. The workflow requires the repository Actions setting to allow GitHub Actions to create releases (the workflow requests `contents: write`). Android release signing and iOS signing still have to be configured in the native projects before publishing store-ready builds.

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
Xcode. Use `npm run build:android` for a local Android APK or `npm run build:ios`
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
