# Use a Single Full-Stack TypeScript Application

Daily is built as a single full-stack TypeScript application containing the web UI, application API, and scheduled summary generation worker. The product has one domain context and shared models across settings, Todo management, summary preview, and email generation, so a single application keeps development simpler than splitting frontend, backend, and worker into separate services upfront.
