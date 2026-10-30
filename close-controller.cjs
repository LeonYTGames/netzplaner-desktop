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
        try {
          await showSaveError(error);
        } catch {}
        // Still allow closing even if save failed
      }
      allowClose = true;
      try {
        closeWindow();
      } catch {}
      // Fallback to force close shortly after
      setTimeout(() => {
        try { if (typeof process !== 'undefined' && process.exit) process.exit(0); } catch {}
      }, 1500);
    } finally {
      promptOpen = false;
    }
  };
}

module.exports = { createCloseController };
