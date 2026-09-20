# Supported Runtime

Daily supports Node.js 22.23.2 with npm 10.9.8 for development, CI, and production.

This pin uses the current Node.js 22 LTS security release checked on 2026-09-19.
Review the Node.js security release page before each production runtime update and
repeat the native `better-sqlite3` build and container tests.

See the [Node.js 22.23.2 release](https://nodejs.org/en/blog/release/v22.23.2) and the
[Node.js release schedule](https://nodejs.org/en/about/previous-releases).

The exact Node.js version is recorded in `.nvmrc`. The npm version and compatible runtime are
also declared in `package.json`. CI installs those versions before running `npm ci`, and production
deployments must use the same versions so the validated lockfile and adapter build match the VPS
runtime.

After dependencies and the Playwright browser are installed, CI runs checks, tests, and the build
in a separate network namespace with only loopback enabled. This lets Playwright reach its local
SvelteKit server while preventing validation code from contacting live providers, production hosts,
or remote databases.
