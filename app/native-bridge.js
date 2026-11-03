(function initializeNativeMobileBridge() {
  const capacitor = window.Capacitor;

  if (!capacitor || typeof capacitor.isNativePlatform !== 'function' || !capacitor.isNativePlatform()) {
    return;
  }

  // Capacitor already knows the native plugins at runtime. Registering the names
  // here gives this plain HTML app the same promise based API as the Electron
  // preload bridge without adding a JavaScript bundler.
  const Filesystem = capacitor.registerPlugin('Filesystem');
  const Share = capacitor.registerPlugin('Share');
  const Browser = capacitor.registerPlugin('Browser');
  const App = capacitor.registerPlugin('App');

  const DATA_DIRECTORY = 'DATA';
  const CACHE_DIRECTORY = 'CACHE';
  const RECOVERY_DIRECTORY = 'projects/recovery';
  const CURRENT_PROJECT_PATH = 'projects/current.json';
  const TEXT_FILE_ENCODING = 'utf8';

  function isValidProjectData(data) {
    return Boolean(
      data &&
      data.format === 'netzplaner' &&
      Array.isArray(data.nodes) &&
      Array.isArray(data.edges)
    );
  }

  function sanitizeFileName(fileName) {
    const sanitized = String(fileName || 'netzplan')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim();
    return sanitized || 'netzplan';
  }

  function createTimestampForFileName() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  async function writeTextFile(path, contents) {
    return Filesystem.writeFile({
      path: path,
      data: contents,
      directory: DATA_DIRECTORY,
      encoding: TEXT_FILE_ENCODING,
      recursive: true
    });
  }

  async function readTextFile(directory, path) {
    try {
      const result = await Filesystem.readFile({
        path: path,
        directory: directory,
        encoding: TEXT_FILE_ENCODING
      });
      if (typeof result.data === 'string') {
        return result.data;
      }
      return await result.data.text();
    } catch {
      return null;
    }
  }

  async function shareFile(directory, fileName, data, encoding) {
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: data,
      directory: directory,
      encoding: encoding,
      recursive: true
    });
    const fileUri = writeResult.uri || (await Filesystem.getUri({
      path: fileName,
      directory: directory
    })).uri;
    await Share.share({
      title: fileName,
      files: [fileUri]
    });
  }

  async function persistProjectData(data) {
    if (!isValidProjectData(data)) {
      throw new Error('Invalid project payload');
    }

    const encodedProjectData = JSON.stringify(data, null, 2);
    const previousContent = await readTextFile(DATA_DIRECTORY, CURRENT_PROJECT_PATH);

    if (previousContent && previousContent !== encodedProjectData) {
      const recoveryFileName = `recovery-${createTimestampForFileName()}.json`;
      await writeTextFile(`${RECOVERY_DIRECTORY}/${recoveryFileName}`, previousContent);
    }

    await writeTextFile(CURRENT_PROJECT_PATH, encodedProjectData);
    return { saved: true, savedAt: new Date().toISOString() };
  }

  async function loadProjectData() {
    const content = await readTextFile(DATA_DIRECTORY, CURRENT_PROJECT_PATH);
    if (!content) {
      return null;
    }

    try {
      const parsedProject = JSON.parse(content);
      return isValidProjectData(parsedProject) ? parsedProject : null;
    } catch {
      return null;
    }
  }

  async function readLatestRecoveryProject() {
    let recoveryFileNames = [];
    try {
      const listing = await Filesystem.readdir({
        path: RECOVERY_DIRECTORY,
        directory: DATA_DIRECTORY
      });
      recoveryFileNames = listing.files
        .map(function getFileName(entry) {
          return entry.name;
        })
        .filter(function isJsonFile(fileName) {
          return fileName.endsWith('.json');
        })
        .sort()
        .reverse();
    } catch {
      return null;
    }

    for (const fileName of recoveryFileNames) {
      const content = await readTextFile(DATA_DIRECTORY, `${RECOVERY_DIRECTORY}/${fileName}`);
      if (!content) {
        continue;
      }
      try {
        const parsedProject = JSON.parse(content);
        if (isValidProjectData(parsedProject)) {
          return parsedProject;
        }
      } catch {
        // Skip invalid recovery files and keep looking for the next snapshot.
      }
    }
    return null;
  }

  function arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
  }

  function toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) {
      return data;
    }
    if (ArrayBuffer.isView(data)) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return new ArrayBuffer(0);
  }

  async function saveProjectFile(data) {
    await persistProjectData(data);

    const fileName = `${sanitizeFileName(data.name || 'netzplan-project')}.json`;
    const encodedProjectData = JSON.stringify(data, null, 2);
    await shareFile(CACHE_DIRECTORY, fileName, encodedProjectData, TEXT_FILE_ENCODING);

    return { saved: true, path: fileName };
  }

  async function exportFile(options) {
    try {
      const baseName = sanitizeFileName(options && options.fileName);
      const extension = sanitizeFileName(options && options.extension || 'bin').toLowerCase();
      const fileName = `${baseName}.${extension}`;
      const data = options && options.data;

      if (!data) {
        return { error: 'No export data provided' };
      }

      const base64Data = arrayBufferToBase64(toArrayBuffer(data));
      await shareFile(CACHE_DIRECTORY, fileName, base64Data);

      return { saved: true, path: fileName };
    } catch (error) {
      return { error: String(error && error.message ? error.message : error) };
    }
  }

  async function openExternal(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return;
    }

    if (parsedUrl.protocol !== 'https:') {
      return;
    }

    await Browser.open({ url: parsedUrl.toString() });
  }

  async function getVersion() {
    try {
      const applicationInfo = await App.getInfo();
      return applicationInfo.version || '';
    } catch {
      return '';
    }
  }

  window.netzplaner = Object.freeze({
    loadProject: loadProjectData,
    saveProject: persistProjectData,
    saveProjectFile: saveProjectFile,
    restoreLatest: readLatestRecoveryProject,
    getVersion: getVersion,
    openExternal: openExternal,
    exportFile: exportFile
  });
})();
