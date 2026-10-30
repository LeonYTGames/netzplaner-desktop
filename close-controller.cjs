function createCloseController({ confirmExit, flushSave, showSaveError, closeWindow }) {
  let allowClose = false;
  let promptOpen = false;

  async function performCloseAttempt(event) {
    if (allowClose) {
      return;
    }
    event.preventDefault();
    if (promptOpen) {
      return;
    }

    promptOpen = true;
    try {
      const shouldExit = await confirmExit();
      if (!shouldExit) {
        return;
      }

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
  }

  return performCloseAttempt;
}

module.exports = { createCloseController };
