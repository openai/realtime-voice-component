# realtime-voice-component

React/browser voice controls for tool-constrained UIs built on OpenAI Realtime.

> Warning
> This repository is an open-source reference implementation. It is useful for
> education, demos, and local adoption, but it is not a promise of long-term
> product support or a production-ready UI kit.

## What This Package Is

This package is for apps where:

- your app defines the exact actions the assistant can take
- tools stay app-owned and narrow
- the UI remains responsible for the visible state change
- you want a React-friendly controller and an optional launcher widget

The package is intentionally opinionated about browser UI flows. It is not a
general-purpose orchestration framework and it is not a replacement for raw
Realtime transports.

## Choose The Right Layer

Use this package when you want a React/browser layer for voice-driven UI:

- a reusable controller with React bindings
- a packaged launcher widget
- optional visible confirmation via the ghost cursor
- a pattern centered on app-owned tools, not free-form browser automation

Use raw Realtime when you want lower-level transport and session control:

- custom audio handling
- non-React runtimes
- your own UI surface and state model from scratch

Use [`openai-agents-js`](https://github.com/openai/openai-agents-js) when you
need a broader headless SDK:

- agent orchestration and handoffs
- richer hosted-tool and MCP flows
- server-side or multi-runtime agent systems beyond a browser UI package

## Demo App

The repo’s [`demo/`](./demo) app is the main runnable teaching surface. It
shows:

- a starter theme-switching flow
- a multi-step form flow
- a richer shared-state chess flow
- shared controller reuse across multiple screens
- optional wake-word experimentation layered on top of the runtime

Run it locally with:

```bash
corepack pnpm demo
```

## Package Shape

- `defineVoiceTool()` turns a Zod-backed app action into a Realtime function
  tool.
- `createVoiceControlController()` owns the session, transport, tool execution,
  transcript assembly, and connection lifecycle.
- `useVoiceControl()` binds React to either an external controller or an
  internally owned one.
- `VoiceControlWidget` is a launcher UI on top of the controller.
- `useGhostCursor()` and `GhostCursorOverlay` are optional visible confirmation
  helpers.

## Recommended Default Flow

For most browser apps in this repo, the recommended path is:

1. proxy the browser SDP + session config through your own `/session` endpoint
2. register one narrow tool that maps to one real app action
3. start with the theme demo or a small controller-based integration
4. send current UI state back into the session after visible changes

## Local Install

This repo is still optimized for local open-source use rather than npm release
readiness.

Install it from a local checkout:

```bash
corepack pnpm add ../path/to/realtime-voice-component zod
```

Then import from `realtime-voice-component` and
`realtime-voice-component/styles.css`.

## Docs

- [Docs overview](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Architecture choices](./docs/architecture-choices.md)
- [Controller and runtime](./docs/controller-runtime.md)
- [Widget and ghost cursor](./docs/widget-and-cursor.md)
- [Authentication](./docs/authentication.md)
- [Showcase demo architecture](./docs/demo-architecture.md)
