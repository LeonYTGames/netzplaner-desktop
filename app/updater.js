(function initializeUpdaterModule() {
  const localStorageKeySkipVersion = 'netzplaner.update.skip';
  const localStorageKeyRemindAt = 'netzplaner.update.remindAt';
  const localStorageKeyEnabled = 'netzplaner.update.enabled';

  function isAutomaticUpdateCheckEnabled() {
    const storedValue = localStorage.getItem(localStorageKeyEnabled);
    if (storedValue === null) {
      return true;
    }
    return storedValue === 'true';
  }

  function setAutomaticUpdateCheckEnabled(isEnabled) {
    localStorage.setItem(localStorageKeyEnabled, isEnabled ? 'true' : 'false');
  }

  function getSkippedVersions() {
    try {
      const storedValue = localStorage.getItem(localStorageKeySkipVersion);
      if (!storedValue) {
        return {};
      }
      return JSON.parse(storedValue);
    } catch {
      return {};
    }
  }

  function addVersionToSkippedList(version) {
    const skippedVersions = getSkippedVersions();
    skippedVersions[version] = true;
    localStorage.setItem(localStorageKeySkipVersion, JSON.stringify(skippedVersions));
  }

  function getReminderTime() {
    const storedValue = localStorage.getItem(localStorageKeyRemindAt);
    if (!storedValue) {
      return 0;
    }
    return parseInt(storedValue, 10);
  }

  function scheduleReminderForLater() {
    const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
    localStorage.setItem(localStorageKeyRemindAt, String(Date.now() + oneDayInMilliseconds));
  }

  function normalizeVersionString(version) {
    if (!version) {
      return '';
    }
    return String(version).replace(/^v/i, '').trim();
  }

  function escapeHtmlCharacters(value) {
    const stringValue = String(value === undefined || value === null ? '' : value);
    return stringValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;');
  }

  async function getCurrentApplicationVersion() {
    if (window.netzplaner && typeof window.netzplaner.getVersion === 'function') {
      try {
        const version = await window.netzplaner.getVersion();
        return version || '';
      } catch {
        return '';
      }
    }
    return '';
  }

  async function openReleaseUrlExternally(url) {
    try {
      if (window.netzplaner && typeof window.netzplaner.openExternal === 'function') {
        await window.netzplaner.openExternal(url);
        return;
      }
    } catch {
      // Fall through to window.open
    }

    try {
      window.open(url, '_blank');
    } catch {
      // Ignore errors
    }
  }

  function showUpdateAvailableDialog(updateInformation) {
    const dialogElement = document.createElement('div');
    dialogElement.className = 'dialog open';

    const escapedVersion = escapeHtmlCharacters(updateInformation.tag);
    dialogElement.innerHTML = '<div class="modal" style="width:min(520px,92vw)">' +
      '<h2>Update available</h2>' +
      '<p>A new version <strong>' + escapedVersion + '</strong> is available on GitHub.</p>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
      '<button class="btn" id="updateSkipButton">Skip this version</button>' +
      '<button class="btn" id="updateLaterButton">Remind me later</button>' +
      '<button class="btn accent" id="updateDownloadButton">Download</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(dialogElement);

    const skipButton = dialogElement.querySelector('#updateSkipButton');
    const laterButton = dialogElement.querySelector('#updateLaterButton');
    const downloadButton = dialogElement.querySelector('#updateDownloadButton');

    if (skipButton) {
      skipButton.onclick = function handleSkipUpdate() {
        addVersionToSkippedList(updateInformation.tag);
        dialogElement.remove();
      };
    }

    if (laterButton) {
      laterButton.onclick = function handleRemindLater() {
        scheduleReminderForLater();
        dialogElement.remove();
      };
    }

    if (downloadButton) {
      downloadButton.onclick = async function handleDownloadUpdate() {
        await openReleaseUrlExternally(updateInformation.url);
        dialogElement.remove();
      };
    }
  }

  async function checkForAvailableUpdates() {
    if (!isAutomaticUpdateCheckEnabled()) {
      return;
    }

    const reminderTime = getReminderTime();
    if (reminderTime && Date.now() < reminderTime) {
      return;
    }

    try {
      const response = await fetch('https://api.github.com/repos/LeonYTGames/netzplaner-desktop/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'netzplaner-desktop'
        }
      });

      if (!response.ok) {
        return;
      }

      const releaseData = await response.json();
      const releaseTag = releaseData.tag_name || releaseData.name || '';
      if (!releaseTag) {
        return;
      }

      const skippedVersions = getSkippedVersions();
      if (skippedVersions[releaseTag]) {
        return;
      }

      const currentVersion = await getCurrentApplicationVersion();
      if (currentVersion && normalizeVersionString(releaseTag) === normalizeVersionString(currentVersion)) {
        return;
      }

      let releaseUrl = releaseData.html_url || '';
      if (!releaseUrl && releaseData.assets && releaseData.assets.length > 0) {
        releaseUrl = releaseData.assets[0].browser_download_url || '';
      }
      if (!releaseUrl) {
        releaseUrl = 'https://github.com/LeonYTGames/netzplaner-desktop/releases/latest';
      }

      showUpdateAvailableDialog({
        tag: releaseTag,
        url: releaseUrl,
        body: releaseData.body || ''
      });
    } catch {
      // Ignore update check errors
    }
  }

  function createSettingsButton() {
    const settingsButton = document.createElement('button');
    settingsButton.className = 'btn';
    settingsButton.id = 'settingsButton';
    settingsButton.textContent = 'Settings';

    const spacerElement = document.querySelector('.topbar .spacer');
    if (spacerElement && spacerElement.parentNode) {
      spacerElement.parentNode.insertBefore(settingsButton, spacerElement);
    }

    settingsButton.onclick = function openSettingsDialog() {
      const dialogElement = document.createElement('div');
      dialogElement.className = 'dialog open';

      dialogElement.innerHTML = '<div class="modal" style="width:min(420px,92vw)">' +
        '<h2>Settings</h2>' +
        '<label class="checkrow" style="margin:10px 0"><input id="updateToggleCheckbox" type="checkbox" ' + (isAutomaticUpdateCheckEnabled() ? 'checked' : '') + '> Enable automatic update checks</label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="settingsCloseButton">Close</button></div>' +
        '</div>';

      document.body.appendChild(dialogElement);

      const toggleCheckbox = dialogElement.querySelector('#updateToggleCheckbox');
      const closeButton = dialogElement.querySelector('#settingsCloseButton');

      if (toggleCheckbox) {
        toggleCheckbox.onchange = function handleToggleChange(event) {
          setAutomaticUpdateCheckEnabled(event.target.checked);
        };
      }

      if (closeButton) {
        closeButton.onclick = function closeSettingsDialog() {
          dialogElement.remove();
        };
      }
    };
  }

  function initializeUpdater() {
    setTimeout(checkForAvailableUpdates, 1500);
    createSettingsButton();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeUpdater);
  } else {
    initializeUpdater();
  }
})();
