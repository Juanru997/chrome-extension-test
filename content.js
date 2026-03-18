let pickerActive = false;
let hoverTarget = null;
let selectedTarget = null;
let toolbar = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_PICKER') {
    selectedTarget = null;
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

function stopPicker({ keepSelectedHighlight = false } = {}) {
  pickerActive = false;
  document.removeEventListener('mouseover', onHover, true);
  document.removeEventListener('click', onClickPick, true);

  if (hoverTarget && hoverTarget !== selectedTarget) {
    hoverTarget.classList.remove('logo-grabber-highlight');
  }

  hoverTarget = null;

  if (!keepSelectedHighlight && selectedTarget) {
    selectedTarget.classList.remove('logo-grabber-highlight');
    selectedTarget = null;
  }
}

function onHover(event) {
  if (!pickerActive) {
    return;
  }

  const element = resolvePickTarget(event.target);

  if (!element || isInsideToolbar(element)) {
    return;
  }

  if (hoverTarget && hoverTarget !== selectedTarget) {
    hoverTarget.classList.remove('logo-grabber-highlight');
  }

  hoverTarget = element;
  if (hoverTarget !== selectedTarget) {
    hoverTarget.classList.add('logo-grabber-highlight');
  }
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

  const picked = resolvePickTarget(event.target);
  if (!picked) {
    setStatus('No image found there. Click directly on a logo/image.');
    return;
  }

  if (selectedTarget && selectedTarget !== picked) {
    selectedTarget.classList.remove('logo-grabber-highlight');
  }

  selectedTarget = picked;
  selectedTarget.classList.add('logo-grabber-highlight');

  stopPicker({ keepSelectedHighlight: true });
  showToolbar(event.clientX, event.clientY);
  setStatus('Logo selected. Use Copy PNG or Save PNG.');
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
}

function setStatus(message) {
  const statusEl = toolbar?.querySelector('#logo-grabber-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

async function copyCurrentAsPng() {
  if (!selectedTarget) {
    setStatus('No target selected. Click Start logo picker again.');
    return;
  }

  try {
    const blob = await extractPngFromElement(selectedTarget);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    setStatus('PNG copied to clipboard.');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
}

async function saveCurrentAsPng() {
  if (!selectedTarget) {
    setStatus('No target selected. Click Start logo picker again.');
    return;
  }

  try {
    const blob = await extractPngFromElement(selectedTarget);
    const dataUrl = await blobToDataUrl(blob);
    const filename = suggestFilename(selectedTarget);

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

function resolvePickTarget(node) {
  if (!(node instanceof Element)) {
    return null;
  }

  const direct = findExtractableElement(node);
  if (direct) {
    return direct;
  }

  const ancestor = node.closest('img,svg,image,[src]');
  if (ancestor) {
    const extracted = findExtractableElement(ancestor);
    if (extracted) {
      return extracted;
    }
  }

  let parent = node.parentElement;
  while (parent) {
    const extracted = findExtractableElement(parent);
    if (extracted) {
      return extracted;
    }
    parent = parent.parentElement;
  }

  if (node instanceof HTMLElement) {
    const descendant = node.querySelector('img,svg,image,[src]');
    if (descendant) {
      const extracted = findExtractableElement(descendant);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function findExtractableElement(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  const svgRoot = getSvgRoot(element);
  if (svgRoot) {
    return svgRoot;
  }

  return getImageSource(element) ? element : null;
}

function getSvgRoot(element) {
  if (!(element instanceof SVGElement)) {
    return null;
  }

  return element.closest('svg') || element;
}

async function extractPngFromElement(element) {
  const svg = getSvgRoot(element);
  if (svg) {
    return renderSvgToPng(svg);
  }

  const source = getImageSource(element);
  if (!source) {
    throw new Error('Selected element is not an image/logo with src or background-image.');
  }

  const image = await loadImageFromUrl(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  if (!canvas.width || !canvas.height) {
    throw new Error('Could not determine image size.');
  }

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  return canvasToBlob(canvas);
}

function getImageSource(element) {
  if (element instanceof HTMLImageElement && element.currentSrc) {
    return element.currentSrc;
  }

  if (element instanceof SVGImageElement && element.href?.baseVal) {
    return new URL(element.href.baseVal, window.location.href).href;
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

async function renderSvgToPng(svgElement) {
  const cloned = svgElement.cloneNode(true);

  if (!cloned.getAttribute('xmlns')) {
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const width = svgElement.viewBox?.baseVal?.width || svgElement.clientWidth || svgElement.getBoundingClientRect().width;
  const height = svgElement.viewBox?.baseVal?.height || svgElement.clientHeight || svgElement.getBoundingClientRect().height;

  if (!width || !height) {
    throw new Error('Could not determine SVG size.');
  }

  if (!cloned.getAttribute('width')) {
    cloned.setAttribute('width', String(Math.ceil(width)));
  }

  if (!cloned.getAttribute('height')) {
    cloned.setAttribute('height', String(Math.ceil(height)));
  }

  const markup = new XMLSerializer().serializeToString(cloned);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  const image = await loadImageFromUrl(svgUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvasToBlob(canvas);
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image. The site may block cross-origin image export.'));
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas conversion failed (image may be cross-origin protected).'));
      }
    }, 'image/png');
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to encode image.'));
    reader.readAsDataURL(blob);
  });
}
