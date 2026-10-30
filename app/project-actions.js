(function initializeProjectActionsModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProjectActions = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProjectActionsModule() {
  async function startNewProject(options) {
    const hasContent = options.hasContent;
    const confirmDiscard = options.confirmDiscard;
    const resetProject = options.resetProject;
    const persistProject = options.persistProject;

    if (hasContent) {
      const shouldDiscard = await confirmDiscard();
      if (!shouldDiscard) {
        return false;
      }
    }

    resetProject();
    await persistProject();
    return true;
  }

  async function restoreLatestProject(options) {
    const saveCurrent = options.saveCurrent;
    const readLatest = options.readLatest;
    const applyRecovered = options.applyRecovered;
    const saveRecovered = options.saveRecovered;

    await saveCurrent();
    const recoveredProject = await readLatest();
    if (!recoveredProject) {
      return null;
    }

    applyRecovered(recoveredProject);
    await saveRecovered();
    return recoveredProject;
  }

  return Object.freeze({
    startNewProject: startNewProject,
    restoreLatestProject: restoreLatestProject
  });
});
