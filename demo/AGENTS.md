# Demo App Instructions

This `demo/` app is organized as a small set of canonical examples for the package, not as a general-purpose sandbox.

## Purpose

- `/` is the overview page. It explains what `realtime-voice-component` is for, how tools fit into the integration model, and which demos to study next.
- `/demo/theme` is the smallest example. It demonstrates a tiny tool surface with one visible UI action plus an optional message tool.
- `/demo/form` is the structured example. It demonstrates one-field-at-a-time updates, post-tool follow-ups, and explicit submission.

## Folder Layout

- `src/demos/shared/`
  - shared card/shell primitives
  - shared toast/message tool
  - shared wake-word hook
  - shared session/controller wiring for cross-demo handoff
- `src/demos/overview/`
  - overview route only
- `src/demos/theme/`
  - `index.tsx` for page UI
  - `controller.ts` for controller wiring
  - `tools.ts` for theme-specific tools
  - `config.ts` for prompt/config constants
- `src/demos/form/`
  - `index.tsx` for page UI
  - `controller.ts` for controller wiring
  - `tools.ts` for form-specific tools
  - `config.ts` for prompt/config constants

## Editing Rules

- Reuse the shared demo card system and `demo.css`. Do not introduce a second visual language for one route.
- Keep demo-specific tools and controller logic inside the matching demo folder.
- Keep cross-demo behaviors in `src/demos/shared/`, especially the shared session wiring and `change_demo` tool.
- Keep the overview page snippets aligned with the current public package API. If tool or controller APIs change, update `/`, `README.md`, and the relevant examples together.
- If wake-word behavior changes, treat it as shared demo behavior unless the change is truly route-specific.
- Switching between interactive demos should reset the Realtime session, then reconnect and resend the visible state for the newly active demo if the widget was already live.
- Keep the package story simple: app-owned tools first, wake word second.
- When changing a demo's visible fields or tool contract, update the route UI, the demo tools/controller, and `test/demoApp.test.tsx` together.

## Validation

Run these when you change the demo app:

- `corepack pnpm demo:typecheck`
- `corepack pnpm test`
- `corepack pnpm demo:build`
