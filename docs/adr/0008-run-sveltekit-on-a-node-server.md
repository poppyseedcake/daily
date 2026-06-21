# Run SvelteKit on a Node Server

Daily runs SvelteKit on a Node server rather than an edge-only deployment target. The application needs OAuth handling, server-side sessions, email generation, delivery retries, external API calls, and scheduled summary generation, and a Node runtime keeps those concerns straightforward while still allowing a separate worker command in the same project.
