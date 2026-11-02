function createProjectStore({ persistProject, loadProject, readLatestRecovery }) {
  let saveQueue = Promise.resolve();

  function enqueueSaveOperation(data) {
    const saveOperation = saveQueue
      .catch(function ignorePreviousSaveError() {})
      .then(function performPersist() {
        return persistProject(data);
      });

    saveQueue = saveOperation;
    return saveOperation;
  }

  function flushQueuedSaves() {
    return saveQueue;
  }

  async function restoreLatestProject() {
    await flushQueuedSaves();
    return readLatestRecovery();
  }

  return Object.freeze({
    save: enqueueSaveOperation,
    flush: flushQueuedSaves,
    loadProject: loadProject,
    restoreLatest: restoreLatestProject
  });
}

module.exports = { createProjectStore };
