# Architecture Choices

Choose your architecture early. This package intentionally exposes two main
shapes:

- a packaged launcher widget
- a headless controller + hook runtime

It also assumes a browser-first UI surface rather than a broader agent
orchestration layer.

## Start With The Widget When

- you want the fastest path to a launcher UI
- one or two app-owned tools are enough
- VAD-style launcher interactions are a good fit
- you want a small floating or inline surface without writing voice controls
  yourself

## Start With The Headless Controller When

- you already have custom UI controls
- one voice session should survive route or layout changes
- you want push-to-talk or custom capture controls
- the packaged widget is too opinionated for your surface

## Keep Browser Tools Narrow

Function tools in this package execute in the browser runtime. That is great
for UI actions such as toggles, form updates, and route changes.

Use app-owned tools for:

- changing visible UI state
- routing to another screen
- collecting missing structured input
- submitting already-validated UI data

Do not move sensitive policy into browser tools if it belongs on the server.
Call your backend from inside the tool instead of keeping that decision in the
browser.

## Single View Versus Shared Controller

Use a local controller for small single-surface integrations.

Use an external shared controller when:

- multiple React components need the same voice session
- route changes should not imply a brand-new runtime
- you want your app, not the hook, to own the controller lifecycle

The showcase demo shows the bigger shared-session version.

## Wake Word Is Not Core Runtime

Wake-word activation is not part of the core package contract.

Treat wake word as:

- optional
- demo-owned
- layered on top of the runtime, not baked into the base integration story

The showcase demo keeps wake word separate for exactly this reason.

## When To Reach For Another Layer

Use raw Realtime when you need lower-level transport or custom audio control.

Use `openai-agents-js` when you need a broader headless SDK for agent
orchestration, MCP-heavy flows, or non-React/multi-runtime agent systems.
