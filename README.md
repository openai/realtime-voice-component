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
cp demo/.env.example demo/.env.local
# edit demo/.env.local and set OPENAI_API_KEY
npm install
npm run demo
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

## Quick App Integration

Install from a local checkout, then import the package and stylesheet:

```bash
npm install ../path/to/realtime-voice-component zod
```

```tsx
import "realtime-voice-component/styles.css";
```

Do not put a standard OpenAI API key in the browser. Add a server endpoint that
forwards the browser's multipart `/session` request to Realtime:

```ts
app.post("/session", async (request, response) => {
  const contentType = request.header("content-type");

  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: request,
    duplex: "half",
  });

  response
    .status(realtimeResponse.status)
    .type(realtimeResponse.headers.get("content-type") ?? "application/sdp")
    .send(await realtimeResponse.text());
});
```

Create one narrow tool, one controller, and one launcher widget:

```tsx
import { useState } from "react";
import { z } from "zod";
import {
  VoiceControlWidget,
  createVoiceControlController,
  defineVoiceTool,
} from "realtime-voice-component";

export function ThemeVoiceControl() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [controller] = useState(() =>
    createVoiceControlController({
      activationMode: "vad",
      auth: { sessionEndpoint: "/session" },
      instructions: "Use tools to control the current screen.",
      outputMode: "tool-only",
      tools: [
        defineVoiceTool({
          name: "set_theme",
          description: "Switch the page theme.",
          parameters: z.object({
            theme: z.enum(["light", "dark"]),
          }),
          execute: ({ theme }) => {
            setTheme(theme);
            return { ok: true, theme };
          },
        }),
      ],
    }),
  );

  return (
    <>
      <p>Current theme: {theme}</p>
      <VoiceControlWidget controller={controller} snapToCorners />
    </>
  );
}
```

For the full first-app guide, read [Getting started](./docs/getting-started.md).

## Turn Detection Defaults

The controller uses Realtime `server_vad` by default. For text and tool-only
sessions, it also sets `interrupt_response: false` so new speech does not cancel
an in-flight text response or tool call. That matters when your UI does not play
assistant audio back to the user.

If you override `audio.input.turnDetection`, use a server VAD shape like this as
the starting point for tool-only UI control:

```ts
{
  type: "server_vad",
  threshold: 0.5,
  prefixPaddingMs: 300,
  silenceDurationMs: 200,
  createResponse: true,
  interruptResponse: false,
}
```

## Integrating With An Existing App

The most reliable retrofit pattern is:

- keep your app as the source of truth
- create one explicit controller for one voice surface
- put a small app-owned wrapper between tools and your real handlers
- keep the widget launcher-focused

For wrapper examples, lifecycle diagrams, shared-controller setup, and
debugging steps, read
[Integrating with an existing app](./docs/integrating-with-an-existing-app.md).

## Integration Rules Of Thumb

- Choose ownership before tools: one screen can own a local controller; shared
  navigation needs a hoisted controller.
- Tools should call app handlers. Do not copy business logic into
  `execute()`.
- Use refs or stable selectors for latest state reads; do not rebuild the whole
  tool list on every state change.
- Keep teardown at the same layer that created the controller. Do not destroy a
  shared controller from a leaf component cleanup.
- Treat `VoiceControlWidget` as a launcher. Build custom UI on the controller
  when you need transcript, debug, push-to-talk, or richer capture controls.
- If the widget stays `idle` and never hits `/session`, inspect controller
  lifecycle, widget mounting, microphone permission, and browser media/WebRTC
  support before debugging the backend.

## Docs

- [Docs overview](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Integrating with an existing app](./docs/integrating-with-an-existing-app.md)
- [Architecture choices](./docs/architecture-choices.md)
- [Controller and runtime](./docs/controller-runtime.md)
- [Widget and ghost cursor](./docs/widget-and-cursor.md)
- [Authentication](./docs/authentication.md)
- [Showcase demo architecture](./docs/demo-architecture.md)
- [API reference](./docs/api-reference.md)
