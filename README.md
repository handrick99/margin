# Margin

A grayscale study widget. Park the thoughts that interrupt a sitting. They stay hidden until you end it and choose to reveal them.

Margin is a web app with the shape of a macOS widget. On a Mac, open it in Safari or Chrome and use **File → Add to Dock** (Safari) so it launches on its own.

## Sitting

1. Choose 25 minutes, 50 minutes, or Open.
2. Begin. Type a thought and press Return. It is stored and cleared. Shift-Return adds a line.
3. End the sitting. Nothing is shown yet.
4. Reveal when you actually want to read them. Copy, discard, or keep the sitting.

Sittings stay in this browser (local storage). Refreshing mid-sitting keeps the timer, the held thoughts, and an unsent line.

## Run

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:3847](http://127.0.0.1:3847).
