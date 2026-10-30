function createCloseController({ confirmExit, flushSave, showSaveError, closeWindow }) {
  let allowClose = false;
  let promptOpen = false;

  return async function handleClose(event) {
    if (allowClose) return;
    event.preventDefault();
    if (promptOpen) return;

    promptOpen = true;
    try {
      if (!(await confirmExit())) return;
      try {
        await flushSave();
      } catch (error) {
        await showSaveError(error);
        return;
      }
      allowClose = true;
      closeWindow();
    } finally {
      promptOpen = false;
    }
  };
}

module.exports = { createCloseController };
