# Render Email With TypeScript Template Functions

Daily renders Daily Summary emails with dedicated TypeScript template functions that return HTML and text output, rather than reusing Svelte UI components. Email clients require constrained markup and inline styling, and the same renderer is used by scheduled delivery, test delivery, and in-app preview to avoid preview/email drift.
