let pickerActive = false;
let currentTarget = null;
let toolbar = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_PICKER') {
    startPicker();
    sendResponse({ ok: true });
  }
});

function startPicker() {
  if (pickerActive) {
    return;
  }

  pickerActive = true;
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('click', onClickPick, true);
}

function stopPicker() {
  pickerActive = false;
  document.removeEventListener('mouseover', onHover, true);
  document.removeEventListener('click', onClickPick, true);
  clearHighlight();
}

function onHover(event) {
  if (!pickerActive) {
    return;
  }

  const element = event.target;
  if (!(element instanceof Element) || isInsideToolbar(element)) {
    return;
  }

  clearHighlight();
  currentTarget = element;
  currentTarget.classList.add('logo-grabber-highlight');
}

function onClickPick(event) {
  if (!pickerActive) {
    return;
  }

  if (isInsideToolbar(event.target)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const element = event.target;
  if (!(element instanceof Element)) {
    return;
  }

  currentTarget = element;
  clearHighlight();
  currentTarget.classList.add('logo-grabber-highlight');

  showToolbar(event.clientX, event.clientY);
}

function clearHighlight() {
  if (currentTarget) {
    currentTarget.classList.remove('logo-grabber-highlight');
  }
}

function isInsideToolbar(node) {
  return toolbar && node instanceof Node && toolbar.contains(node);
}

function showToolbar(x, y) {
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'logo-grabber-toolbar';
    toolbar.innerHTML = `
      <button id="logo-grabber-copy">Copy PNG</button>
      <button id="logo-grabber-save">Save PNG</button>
      <button id="logo-grabber-cancel">Close</button>
      <span id="logo-grabber-status"></span>
    `;
    document.body.append(toolbar);

    toolbar.querySelector('#logo-grabber-copy').addEventListener('click', copyCurrentAsPng);
    toolbar.querySelector('#logo-grabber-save').addEventListener('click', saveCurrentAsPng);
    toolbar.querySelector('#logo-grabber-cancel').addEventListener('click', () => {
      toolbar.remove();
      toolbar = null;
      stopPicker();
    });
  }

  toolbar.style.left = `${Math.min(x + 12, window.innerWidth - 260)}px`;
  toolbar.style.top = `${Math.min(y + 12, window.innerHeight - 70)}px`;
  setStatus('Logo selected.');
}

function setStatus(message) {
  const statusEl = toolbar?.querySelector('#logo-grabber-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

async function copyCurrentAsPng() {
  if (!currentTarget) {
    setStatus('No target selected.');
    return;
  }

  try {
    const blob = await extractPngFromElement(currentTarget);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    setStatus('PNG copied to clipboard.');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
}

async function saveCurrentAsPng() {
  if (!currentTarget) {
    setStatus('No target selected.');
    return;
  }

  try {
    const blob = await extractPngFromElement(currentTarget);
    const dataUrl = await blobToDataUrl(blob);
    const filename = suggestFilename(currentTarget);

    chrome.runtime.sendMessage({ type: 'SAVE_PNG', dataUrl, filename }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Save failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      setStatus(response?.ok ? 'Save dialog opened.' : `Save failed: ${response?.error || 'Unknown error'}`);
    });
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  }
}

function suggestFilename(el) {
  const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || el.id || el.className || 'logo';
  const safe = String(alt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${safe || 'logo'}-${Date.now()}.png`;
}

async function extractPngFromElement(element) {
  const source = getImageSource(element);
  if (!source) {
    throw new Error('Selected element is not an image/logo with src or background-image.');
  }

  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  if (!canvas.width || !canvas.height) {
    throw new Error('Could not determine image size.');
  }

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas conversion failed.'));
      }
    }, 'image/png');
  });
}

function getImageSource(element) {
  if (element instanceof HTMLImageElement && element.currentSrc) {
    return element.currentSrc;
  }

  if (element instanceof SVGImageElement && element.href?.baseVal) {
    return element.href.baseVal;
  }

  const style = getComputedStyle(element);
  const backgroundImage = style.backgroundImage;

  if (backgroundImage && backgroundImage !== 'none') {
    const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (match?.[1]) {
      return new URL(match[1], window.location.href).href;
    }
  }

  const inlineSrc = element.getAttribute('src');
  if (inlineSrc) {
    return new URL(inlineSrc, window.location.href).href;
  }

  return null;
}

async function loadImage(url) {
  const response = await fetch(url, { mode: 'cors', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status}).`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image.'));
      img.src = blobUrl;
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to encode image.'));
    reader.readAsDataURL(blob);
  });
}
