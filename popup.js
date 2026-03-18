const status = document.getElementById('status');
const startPickerButton = document.getElementById('startPicker');

startPickerButton.addEventListener('click', async () => {
  status.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      status.textContent = 'No active tab found.';
      return;
    }

    if (!isSupportedUrl(tab.url)) {
      status.textContent = 'This page does not allow extension scripts (try a normal http/https site).';
      return;
    }

    await ensurePickerInjected(tab.id);
    const response = await sendStartPicker(tab.id);

    status.textContent = response?.ok
      ? 'Picker active. Click a logo/image in the page.'
      : 'Picker was not activated.';
  } catch (error) {
    status.textContent = `Could not start picker: ${error.message}`;
  }
});

function isSupportedUrl(url) {
  if (!url) return false;
  return /^(https?:|file:)/.test(url);
}

async function ensurePickerInjected(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

function sendStartPicker(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'START_PICKER' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
