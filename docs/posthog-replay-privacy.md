# Session replay privacy

The workspace keeps application copy readable in PostHog replay. Mark every fragment
that renders User or Visitor content with `data-private`, including content echoed
from unsaved inputs, saved settings, Google Calendar, and account details:

```svelte
<p>Summary Recipient: <span data-private>{recipient}</span></p>
<strong data-private>{task.title}</strong>
```

Keep the marker on the smallest content boundary so nearby static labels remain
readable. For mixed empty and configured states, use `data-private={hasValue ? '' :
undefined}`. Text added or changed under this boundary is masked by the recorder.
All form values remain masked independently, including select options.
The drag-and-drop library's screen-reader announcements are masked separately because
they repeat Task and Category names outside the workspace's rendering tree.

The root layout masks text on routes outside the audited workspace and static legal
pages, including Admin, prototypes, and error pages. Audit private rendering boundaries
before allowing readable text on another route.

Autocapture stays disabled. The attribute filter masks content-bearing attributes
(including dynamic accessible labels, IDs, data attributes, and arbitrary URLs).
It retains presentation metadata and only explicitly approved application placeholders
and static assets. Never derive CSS classes or presentation styles from private text.

`npm run test:e2e:replay` records the production build through PostHog's actual SDK,
checks uploaded snapshots for both readable application copy and absent private content,
and renders those snapshots with PostHog's replayer to verify CSS and modal state.
The signed-in scenario exercises saved Tasks and Categories, account details, Weather
Cities, Commute Routes and Addresses, Calendar Events and selection, and unsaved Task
previews. These tests use isolated data and a fake project token.

Masking happens at capture time: configuration changes affect new recordings only.
