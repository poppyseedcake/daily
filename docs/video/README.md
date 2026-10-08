# Daily demo video

This Remotion project creates the [Daily demo MP4](../media/daily-demo.mp4).
The video is 24 seconds long, at 1920 × 1080 pixels and 30 frames per second.
It has four scenes with English instructions. It has no audio.

The scenes use real application screenshots with fictional Visitor data.
The last scene shows the welcome screen's example email, not a delivered email.
Each scene also has its own composition in Remotion Studio.

## Open the video project

Use the Node.js and npm versions specified in the [main README](../../README.md#install-and-run-locally).
Run these commands from the repository root:

```sh
cd docs/video
npm ci
npm run dev
```

Open [http://localhost:3001/DailyDemo](http://localhost:3001/DailyDemo).
Select **DailyDemo** for the full video. Select a composition under **Scenes** to inspect one scene.
Edit `src/Scene.tsx` for the common layout. Edit the other scene files for their text and screenshots.

This project has its own dependencies. The Daily application does not require Remotion.

## Export the MP4

Run this command from `docs/video`:

```sh
npm run render
```

The command replaces `docs/media/daily-demo.mp4`.
Remotion downloads Chrome Headless Shell on the first render. That download requires network access.
See the [Remotion render documentation](https://www.remotion.dev/docs/cli/render) for export options.

## Make new screenshots

1. Install the main application's dependencies with `npm ci` from the repository root.
2. Install the capture browser:

   ```sh
   npx playwright install chromium
   ```

3. Start Daily locally with scheduled delivery disabled. Use an isolated local database.
4. Run the capture command from `docs/video`:

   ```sh
   npm run capture
   ```

The default application URL is `http://127.0.0.1:5174`.
For a different local server, set `DAILY_DOCS_URL`:

```sh
DAILY_DOCS_URL=http://127.0.0.1:5175 npm run capture
```

The script uses a new browser context, fictional tasks, and browser-local settings.
It does not sign in or send emails. It checks task creation through the application interface.
It replaces five files in `docs/images` and copies them to this project's `public` directory.
After capture, run `npm run render` to update the video.

## Check the source

```sh
npm run check
```
