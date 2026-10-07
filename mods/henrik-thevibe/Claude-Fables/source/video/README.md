# Launch video

A 63-second launch video for Claude Fables, rendered from code. Every cartoon in it is drawn by the mod's own `sceneToSvg`, from scenes in the narrator's format, and stepped frame by frame. The desktop window around it, the conversation and the "Fable 5.1 · Ultracode" footer are a mock-up for the video.

```sh
bun video/render.ts                    # → video/out/claude-fables-launch.mp4 (1920×1080, 30 fps)
bun video/render.ts --still 3.2,17     # single frames, to check a moment
bun video/audio.ts out.wav             # the soundtrack alone
```

It needs Playwright with Chromium (`PLAYWRIGHT_MODULE` points at it when it isn't at `/opt/node22/lib/node_modules/playwright`) and ffmpeg. The first run fetches Inter and JetBrains Mono from Google Fonts and caches them in `video/out/`.

| File | What it does |
| --- | --- |
| `shots.ts` | The script: the scenes, the band's queue, the full-screen shots, the camera, the conversation and the sound cues, all on one clock |
| `stage.js` | The page drawn as a function of time, so any frame can be captured on its own |
| `ui.css` | The mock desktop window, the full-screen layer and the end card |
| `audio.ts` | The chiptune and sound effects, synthesized to a WAV on the script's bar grid |
| `render.ts` | Checks every scene with `parseScene`, draws them, captures the frames in parallel and encodes with ffmpeg |
