# Daily error pages

The accepted design uses version 189 as its base and the displaced upper-right
shape from version 109 for 404. The upper-right shape in both states has a pale
blue fill (`#EFF2F6`) and navy outline (`#172D52`). The remaining geometry follows
the Daily logo: sage circle, olive rounded square, and navy lower-left arch or
pause bars. The local Manrope and Fraunces fonts include their OFL licenses.

| Status | Heading | Description | Recovery |
| --- | --- | --- | --- |
| 404 | A page out of place. | We couldn’t find this page. Check the address or return to Daily. | Go to Daily |
| 500 and other server errors | Daily, on pause. | Daily couldn’t load this page. Try again in a moment. | Try again; Back to Daily |

`src/routes/+error.svelte` uses the real SvelteKit error status and sets a page
title. The root layout sets one `noindex, nofollow` tag for error responses,
including errors on routes it already excludes from search. The error route
renders the shared `ErrorPage` component without
displaying server error messages or stack traces. Other 4xx statuses use a neutral
message and their original code. HTTP status handling stays with SvelteKit.

The logo, home action and legal links use ordinary links and work without
JavaScript. Try again reloads the current document rather than navigating to an
already active client route; with JavaScript it preserves the query and fragment.
Without JavaScript the retry link preserves the path and query.

The layout has desktop and mobile compositions, keyboard focus indicators and
44px recovery targets. The illustration is decorative; the labeled error region
and heading provide its meaning to assistive technology. No animation is added.

The `/prototype/error-pages` route shows both states for visual review. Pass
`?status=404` or `?status=500` for a single state. These previews return 200; actual
errors use SvelteKit’s error boundary and preserve the error HTTP status.

Regression coverage in `tests/e2e/error-pages.spec.ts` exercises a real missing
address, a failed client page-load request, recovery by full document reload,
query/fragment preservation, small screens, and rendering without JavaScript.
The no-JavaScript 500 test makes the fixture User's session renewal fail in the
real server page load. It checks HTTP 500, the error heading/title, a single
noindex tag, hidden diagnostics, and successful document retry after recovery.
The database fault is scoped to that User and removed even if the test fails.
