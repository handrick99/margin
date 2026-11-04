# Margin

Margin is a quiet desk widget for a study sitting. You park the thoughts that interrupt you. They stay hidden until you end the sitting, then you can reveal them.

This is a web widget you open in a browser. It is not a signed macOS `.app`. A native app cannot be built in this environment. On a Mac, open the page in Safari and choose **File → Add to Dock**. The manifest uses standalone display, so the dock item opens without the usual browser chrome.

## A sitting

1. Choose 25 minutes, 50 minutes, or Open, then begin.
2. Type a thought and press Return to park it. It leaves the page immediately. Shift+Return inserts a line break. You only see how many are held.
3. End the sitting when you are done. An unsent line is parked as you end, unless it is longer than 4,000 characters — shorten that one first. If a timed block finishes, Margin says so and keeps the thoughts closed. You can keep writing.
4. Reveal to read them in order, with the time each one arrived. Copy the transcript, discard the sitting, or keep it and return to the desk.
5. Earlier sittings are listed by date, duration, and count. Open one to read it again. That list never shows the words. You cannot open an earlier sitting while one is still live or sealed.

Ink is the dark theme. Paper is the light one. Both are grayscale. The choice is remembered on this device.

Thoughts stay in this browser (`localStorage`). They are not sent anywhere. If storage is blocked, the sitting stays in the tab and Margin says so.

## Run

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:3847.
