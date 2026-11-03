const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'native-bridge.js'), 'utf8');

function createNativeBridgeHarness({ isNativePlatform = true } = {}) {
  const storedFiles = new Map();
  const sharedFiles = [];
  const openedUrls = [];

  const plugins = {
    Filesystem: {
      async writeFile(options) {
        storedFiles.set(`${options.directory}:${options.path}`, options.data);
        return { uri: `file:///${options.directory}/${options.path}` };
      },
      async readFile(options) {
        const key = `${options.directory}:${options.path}`;
        if (!storedFiles.has(key)) {
          throw new Error('File not found');
        }
        return { data: storedFiles.get(key) };
      },
      async readdir(options) {
        const prefix = `${options.directory}:${options.path}/`;
        const fileNames = new Set();
        for (const key of storedFiles.keys()) {
          if (!key.startsWith(prefix)) {
            continue;
          }
          const remainingPath = key.slice(prefix.length);
          if (!remainingPath.includes('/')) {
            fileNames.add(remainingPath);
          }
        }
        if (fileNames.size === 0) {
          throw new Error('Directory not found');
        }
        return { files: [...fileNames].map(name => ({ name })) };
      },
      async getUri(options) {
        return { uri: `file:///${options.directory}/${options.path}` };
      }
    },
    Share: {
      async share(options) {
        sharedFiles.push(options);
        return {};
      }
    },
    Browser: {
      async open(options) {
        openedUrls.push(options.url);
      }
    },
    App: {
      async getInfo() {
        return { version: '9.9.9' };
      }
    }
  };

  const windowObject = {
    Capacitor: {
      isNativePlatform() {
        return isNativePlatform;
      },
      registerPlugin(pluginName) {
        return plugins[pluginName];
      }
    }
  };

  const context = vm.createContext({
    window: windowObject,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    URL,
    console
  });

  vm.runInContext(bridgeSource, context);

  return {
    api: windowObject.netzplaner,
    createArrayBuffer(bytes) {
      return vm.runInContext(`Uint8Array.from(${JSON.stringify(bytes)}).buffer`, context);
    },
    storedFiles,
    sharedFiles,
    openedUrls
  };
}

function createProject(name) {
  return {
    format: 'netzplaner',
    version: 1,
    name,
    nodes: [{ id: 'node-1', x: 0, y: 0, data: { id: '1', task: 'Test' } }],
    edges: []
  };
}

test('mobile bridge exposes the same project API as the Electron preload script', () => {
  const { api } = createNativeBridgeHarness();

  assert.deepEqual(
    Object.keys(api).sort(),
    ['exportFile', 'getVersion', 'loadProject', 'openExternal', 'restoreLatest', 'saveProject', 'saveProjectFile']
  );
});

test('mobile bridge does not replace the desktop API on the web platform', () => {
  const { api } = createNativeBridgeHarness({ isNativePlatform: false });

  assert.equal(api, undefined);
});

test('mobile bridge persists the current project and keeps the previous version for recovery', async () => {
  const { api } = createNativeBridgeHarness();
  const firstProject = createProject('First project');
  const secondProject = createProject('Second project');

  await api.saveProject(firstProject);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.loadProject())), firstProject);

  await api.saveProject(secondProject);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.loadProject())), secondProject);
  assert.equal((await api.restoreLatest()).name, 'First project');
});

test('mobile bridge shares a project file and exports binary data through the system share sheet', async () => {
  const { api, createArrayBuffer, storedFiles, sharedFiles } = createNativeBridgeHarness();
  const project = createProject('Shared project');
  const binaryData = createArrayBuffer([104, 105]);

  const savedProjectFile = await api.saveProjectFile(project);
  assert.equal(savedProjectFile.saved, true);
  assert.equal(savedProjectFile.path, 'Shared project.json');
  assert.equal(sharedFiles[0].title, 'Shared project.json');
  assert.deepEqual([...sharedFiles[0].files], ['file:///CACHE/Shared project.json']);

  const exportedFile = await api.exportFile({ fileName: 'Plan', extension: 'png', data: binaryData });
  assert.equal(exportedFile.saved, true);
  assert.equal(exportedFile.path, 'Plan.png');
  assert.equal(storedFiles.get('CACHE:Plan.png'), Buffer.from('hi').toString('base64'));
});

test('mobile bridge opens only secure external links and reports the app version', async () => {
  const { api, openedUrls } = createNativeBridgeHarness();

  await api.openExternal('javascript:alert(1)');
  await api.openExternal('http://example.com');
  await api.openExternal('https://github.com/LeonYTGames/netzplaner-desktop/releases/latest');

  assert.deepEqual(openedUrls, ['https://github.com/LeonYTGames/netzplaner-desktop/releases/latest']);
  assert.equal(await api.getVersion(), '9.9.9');
});
