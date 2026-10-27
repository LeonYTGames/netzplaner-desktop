function createProjectStore({ persistProject, loadProject, readLatestRecovery }) {
  let saveQueue = Promise.resolve();

  function save(data) {
    const operation = saveQueue.catch(() => {}).then(() => persistProject(data));
    saveQueue = operation;
    return operation;
  }

  function flush() {
    return saveQueue;
  }

  async function restoreLatest() {
    await flush();
    return readLatestRecovery();
  }

  return Object.freeze({ save, flush, loadProject, restoreLatest });
}

module.exports = { createProjectStore };
