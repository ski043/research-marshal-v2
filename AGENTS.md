# Research Marshal

Research Marshal answers one research question with a cited Markdown report. Every fact in the report carries a quote that the app verified on a real web page.

## Source of truth

[PRD.md](PRD.md) defines what the product does. Read it before you plan or write code.

- If you have a question about behavior, scope, or terms, look in the PRD first.
- If the PRD does not answer the question, ask the user. Do not guess.
- If a task conflicts with the PRD, stop and ask the user.
- The PRD lists open questions. Do not decide them yourself.
- Use the terms from the Terms table of the PRD. Refer to requirements by their ID, for example V1 or B3.
- Change the PRD only when the user asks you to.

## Tech stack

[TECH_STACK.md](TECH_STACK.md) defines the technologies that the project uses. Read it before you add a dependency or write code.

- Use the technologies and the versions that the tech stack lists.
- The tech stack has a table of technologies that the project does not use. Do not add one of them.
- If you need a dependency that the tech stack does not list, ask the user. Do not add it yourself.
- Change the tech stack only when the user asks you to.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
