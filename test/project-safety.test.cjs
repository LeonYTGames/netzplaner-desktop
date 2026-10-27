const test = require('node:test');
const assert = require('node:assert/strict');

const { createCloseController } = require('../close-controller.cjs');
const { createProjectStore } = require('../project-store.cjs');
const { startNewProject, restoreLatestProject } = require('../app/project-actions.js');

test('failed final save keeps the window open and reports the error', async () => {
  const calls = [];
  const failure = new Error('disk full');
  const onClose = createCloseController({
    confirmExit: async () => true,
    flushSave: async () => { calls.push('flush'); throw failure; },
    showSaveError: async error => calls.push(['error', error]),
    closeWindow: () => calls.push('close')
  });
  const event = { prevented: false, preventDefault() { this.prevented = true; } };

  await onClose(event);

  assert.equal(event.prevented, true);
  assert.deepEqual(calls, ['flush', ['error', failure]]);
  assert.equal(calls.includes('close'), false);
});

test('successful final save permits the window to close exactly once', async () => {
  const calls = [];
  const onClose = createCloseController({
    confirmExit: async () => true,
    flushSave: async () => calls.push('flush'),
    showSaveError: async () => calls.push('error'),
    closeWindow: () => calls.push('close')
  });
  const event = { preventDefault() { this.prevented = true; } };

  await onClose(event);
  assert.deepEqual(calls, ['flush', 'close']);
  assert.equal(event.prevented, true);
  assert.equal(await onClose({ preventDefault() { throw new Error('should not intercept approved close'); } }), undefined);
});

test('recovery waits for current save before reading or applying recovered data', async () => {
  let finishCurrentSave;
  const currentSave = new Promise(resolve => { finishCurrentSave = resolve; });
  const order = [];
  const recovered = { name: 'Recovered', nodes: [], edges: [] };
  const restoring = restoreLatestProject({
    saveCurrent: () => { order.push('save-current-start'); return currentSave.then(() => order.push('save-current-done')); },
    readLatest: async () => { order.push('read-latest'); return recovered; },
    applyRecovered: value => { order.push('apply'); assert.equal(value, recovered); },
    saveRecovered: async () => order.push('save-recovered')
  });

  await Promise.resolve();
  assert.deepEqual(order, ['save-current-start']);
  finishCurrentSave();
  assert.equal(await restoring, recovered);
  assert.deepEqual(order, ['save-current-start', 'save-current-done', 'read-latest', 'apply', 'save-recovered']);
});

test('recovery does not read or apply backup if preserving current state fails', async () => {
  let readCount = 0;
  let applyCount = 0;
  await assert.rejects(restoreLatestProject({
    saveCurrent: async () => { throw new Error('save failed'); },
    readLatest: async () => { readCount++; return {}; },
    applyRecovered: () => { applyCount++; },
    saveRecovered: async () => {}
  }), /save failed/);
  assert.equal(readCount, 0);
  assert.equal(applyCount, 0);
});

test('project store waits for queued saves to finish before reading recovery', async () => {
  let finishSave;
  const order = [];
  const store = createProjectStore({
    persistProject: () => new Promise(resolve => { order.push('persist-start'); finishSave = () => { order.push('persist-done'); resolve(); }; }),
    loadProject: () => null,
    readLatestRecovery: () => { order.push('read-recovery'); return { name: 'backup' }; }
  });
  const saving = store.save({ name: 'current' });
  const recovering = store.restoreLatest();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...order], ['persist-start']);
  finishSave();
  await saving;
  assert.deepEqual(await recovering, { name: 'backup' });
  assert.deepEqual([...order], ['persist-start', 'persist-done', 'read-recovery']);
});

test('new project resets and persists empty state before completing', async () => {
  let project = { name: 'Old', nodes: [{ id: 'n1' }], edges: [] };
  const saved = [];
  let finishPersist;
  const creating = startNewProject({
    hasContent: true,
    confirmDiscard: async () => true,
    resetProject: () => { project = { name: 'Unbenanntes Projekt', nodes: [], edges: [] }; },
    persistProject: () => new Promise(resolve => { saved.push(structuredClone(project)); finishPersist = resolve; })
  });

  await Promise.resolve();
  assert.deepEqual(saved, [{ name: 'Unbenanntes Projekt', nodes: [], edges: [] }]);
  let completed = false;
  creating.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  finishPersist();
  assert.equal(await creating, true);
});

test('canceling new project leaves current project untouched and does not save', async () => {
  let reset = false;
  let persisted = false;
  const started = await startNewProject({
    hasContent: true,
    confirmDiscard: async () => false,
    resetProject: () => { reset = true; },
    persistProject: async () => { persisted = true; }
  });
  assert.equal(started, false);
  assert.equal(reset, false);
  assert.equal(persisted, false);
});
