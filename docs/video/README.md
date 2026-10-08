# Daily demo video

The [Daily demo MP4](../media/daily-demo.mp4) records use of a local copy of Daily.
The video is approximately 52 seconds long, at 1280 × 880 pixels and 30 frames per second.
It shows the cursor, clicks, and text entry. It has English instructions and no audio.

The demo shows these actions:

1. Create a group and add a task.
2. Add a Commute Route and select its days.
3. Review Calendar events and select a calendar.
4. Select a Weather Location.
5. Set the delivery time and time zone.

The account and tasks are fictional. Calendar events, address search results, and travel times are sample data.
The application saves the task, route, city, and delivery time to a temporary database.
The script checks the saved settings after a page reload. It does not send emails.
The README uses an animated GIF that repeats continuously.

## Record the demo

1. Run `npm ci` from the repository root and from `docs/video`.
2. Run `npx playwright install chromium` from the repository root.
3. Run `npm run record` from `docs/video`.

The command starts local application and Calendar servers on free ports.
It creates a temporary database and a demo account. It uses sample service responses.
It stops the servers and deletes the temporary database when the recording is complete.
The recording is saved to `public/daily-walkthrough.webm`.
Chapter times are saved to `src/walkthrough.json`.

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

## Check the source

```sh
npm run check
```
