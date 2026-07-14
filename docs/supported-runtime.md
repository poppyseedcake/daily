# Supported Runtime

Daily supports Node.js 22.15.0 with npm 10.9.2 for development, CI, and production.

The exact Node.js version is recorded in `.nvmrc`. The npm version and compatible runtime are
also declared in `package.json`. CI installs those versions before running `npm ci`, and production
deployments must use the same versions so the validated lockfile and adapter build match the VPS
runtime.
