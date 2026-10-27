(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProjectActions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function startNewProject({ hasContent, confirmDiscard, resetProject, persistProject }) {
    if (hasContent && !(await confirmDiscard())) return false;
    resetProject();
    await persistProject();
    return true;
  }

  async function restoreLatestProject({ saveCurrent, readLatest, applyRecovered, saveRecovered }) {
    await saveCurrent();
    const recovered = await readLatest();
    if (!recovered) return null;
    applyRecovered(recovered);
    await saveRecovered();
    return recovered;
  }

  return Object.freeze({ startNewProject, restoreLatestProject });
});
