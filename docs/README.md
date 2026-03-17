# Docs Overview

The package is still experimental, so the docs optimize for practical
architecture choices and the real package/demo layers rather than a long API
dump.

## Read In This Order

1. [Getting started](./getting-started.md)
2. [Architecture choices](./architecture-choices.md)
3. [Controller and runtime](./controller-runtime.md)
4. [Widget and ghost cursor](./widget-and-cursor.md)
5. [Authentication](./authentication.md)
6. [Showcase demo architecture](./demo-architecture.md)

## Current Architecture

The package is split into five practical layers:

- tool definition with `defineVoiceTool()`
- controller and hook runtime with `createVoiceControlController()` and `useVoiceControl()`
- browser transport over Realtime WebRTC with a server-proxied `/session` bootstrap by default
- launcher UI with `VoiceControlWidget`
- optional visual confirmation with `useGhostCursor()` and `GhostCursorOverlay`

## What These Docs Optimize For

- how to wire a working integration quickly
- when to use the widget versus the controller directly
- how the showcase demo models richer patterns without redefining the package contract
- which behaviors are important but easy to miss, such as tool-only no-op handling, post-tool follow-ups, and state sync via system messages

## Important Framing

This repo is educational and demo-oriented. The docs explain the current code
path and recommended patterns, but they are not a promise of long-term API
stability or production support.

The package also supports local installation only right now. Clone this repo and
install it from that local path rather than from npm.
