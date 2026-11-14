# Margin

A grayscale desktop widget for studying. Park the thoughts that interrupt a sitting. They stay hidden until you end it and choose to reveal them.

## Sitting

1. Choose 25 minutes, 50 minutes, or Open.
2. Begin. Type a thought and press Return. It is stored and cleared. Shift-Return adds a line.
3. End the sitting. Nothing is shown yet.
4. Reveal when you want to read them. Copy, discard, or keep the sitting.

Drag the wordmark to move the window. It stays above your other windows. Sittings are kept on this computer.

## Install on a Mac

1. Download `Margin-mac-apple-silicon.tar.xz` (M1 or newer) or `Margin-mac-intel.tar.xz`, then double-click it to unpack `Margin.app`.
2. Drag `Margin.app` into Applications.
3. The app is not notarized by Apple, so the first launch is blocked. Clear the download flag once in Terminal:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Margin.app
   ```

   Or open it once, then go to System Settings → Privacy & Security and choose **Open Anyway**.

## Build it yourself

```bash
npm install
npm run dist:mac
```

The app lands in `release/`. On a Mac it is signed for local use automatically.

## Develop

```bash
npm run desktop
```

That runs the screens with live reload inside the desktop window. `npm run app` runs the bundled build the same way the installed app does.
