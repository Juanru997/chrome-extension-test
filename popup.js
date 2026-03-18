const status = document.getElementById('status');
const startPickerButton = document.getElementById('startPicker');

startPickerButton.addEventListener('click', async () => {
  status.textContent = '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    status.textContent = 'No active tab found.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'START_PICKER' }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = 'Could not start picker on this page.';
      return;
    }

    status.textContent = response?.ok
      ? 'Picker active. Click a logo/image in the page.'
      : 'Picker was not activated.';
  });
});
