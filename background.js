chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SAVE_PNG' || !message?.dataUrl) {
    return;
  }

  chrome.downloads.download(
    {
      url: message.dataUrl,
      filename: message.filename || `logo-${Date.now()}.png`,
      saveAs: true,
    },
    () => sendResponse({ ok: !chrome.runtime.lastError, error: chrome.runtime.lastError?.message })
  );

  return true;
});
