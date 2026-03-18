# Logo Grabber Chrome Extension

This extension lets you pick logos/images on any website and either:

- copy them as **PNG** to your clipboard
- save them as **PNG** to your local machine

## Install (developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Usage

1. Open any website.
2. Click the extension icon.
3. Click **Start logo picker**.
4. Hover and click the logo/image you want.
5. Use the floating toolbar:
   - **Copy PNG** → copies image to your clipboard as PNG
   - **Save PNG** → opens save dialog to download PNG

## Notes and limitations

- Works best for standard `<img>` logos and simple CSS `background-image` logos.
- Some sites block cross-origin fetch/canvas operations; those images may fail to copy/save.
- Clipboard image writing requires a secure context and browser support.
