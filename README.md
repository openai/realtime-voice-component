# realtime-voice-component

Experimental voice controls for browser apps using OpenAI Realtime.

> Warning
> This repository is for education, demos, and reference implementations.
> OpenAI does not plan to turn it into a broadly supported production UI kit,
> actively maintain it as a polished framework, or take responsibility for
> productizing it for your use case. Treat it as example code that helps you
> understand the pattern and build your own implementation.

This package is for apps where you define the exact actions the assistant can
take. The model does not get free browser or desktop control. Instead, your app
registers narrow tools, the runtime exposes those tools to Realtime, and your
UI stays responsible for the actual state changes and confirmation.

The package is not currently published to npm. Install it from a local checkout of
this repo for now.

## Local Install Only

From your app, install the package from a local clone of this repository:

```bash
npm add ../path/to/realtime-voice-component zod
```

Replace `../path/to/realtime-voice-component` with the path to your clone. After
installing, import from `realtime-voice-component` and
`realtime-voice-component/styles.css`.

## How The Pieces Fit Together

- `defineVoiceTool()` turns a Zod-backed app action into a Realtime function tool.
- `createVoiceControlController()` owns the Realtime session, tool execution, transcript, and connection lifecycle.
- `useVoiceControl()` binds React to either a controller you created or options that should create one for you.
- `VoiceControlWidget` gives you a small floating launcher on top of the runtime.
- `useGhostCursor()` and `GhostCursorOverlay` are optional visual feedback layers for showing the user what changed.

## Fastest Integration Path

The simplest path is:

1. Add a small server endpoint that proxies the browser SDP offer to OpenAI.
2. Register a narrow tool that maps to one real app action.
3. Render the launcher widget.
4. Optionally add the ghost cursor so tool effects are visible.

Server example:

```ts
app.post("/session", async (request, response) => {
  const contentType = request.header("content-type");

  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(contentType ? { "Content-Type": contentType } : {})
    },
    body: request,
    duplex: "half"
  });

  response
    .status(realtimeResponse.status)
    .type(realtimeResponse.headers.get("content-type") ?? "application/sdp")
    .send(await realtimeResponse.text());
});
```

React example:

```tsx
import { useRef, useState } from "react";
import { z } from "zod";
import {
  createVoiceControlController,
  defineVoiceTool,
  GhostCursorOverlay,
  useGhostCursor,
  VoiceControlWidget
} from "realtime-voice-component";
import "realtime-voice-component/styles.css";

type Theme = "light" | "dark";

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const cursor = useGhostCursor();
  const controller = createVoiceControlController({
    auth: { sessionEndpoint: "/session" },
    instructions: "Use the registered tools to control the page. Prefer tools over chat.",
    outputMode: "tool-only",
    tools: [
      defineVoiceTool({
        name: "set_theme",
        description: "Switch the visible page theme between light and dark mode.",
        parameters: z.object({
          theme: z.enum(["light", "dark"])
        }),
        async execute({ theme }) {
          const button = buttonRef.current;

          return cursor.run(
            {
              element: button,
              pulseElement: button
            },
            async () => {
              setTheme(theme);
              return { ok: true, theme };
            },
            {
              from: "previous"
            }
          );
        }
      })
    ]
  });

  return (
    <>
      <GhostCursorOverlay state={cursor.cursorState} />

      <button ref={buttonRef} type="button">
        Current theme: {theme}
      </button>

      <VoiceControlWidget controller={controller} snapToCorners />
    </>
  );
}
```

## Best Practices From This Repo

- Keep tools narrow and app-owned. Good tools map to one real app action.
- Default to `outputMode="tool-only"` when the assistant should act instead of chat.
- Prefer `auth={{ sessionEndpoint: "/session" }}` for browser WebRTC apps so your server stays in charge of session setup.
- In this repo, prefer creating a controller explicitly and passing `controller={controller}` to `VoiceControlWidget`.
- Move to `createVoiceControlController()` and `useVoiceControl()` when you need custom UI, richer state handling, or push-to-talk flows.
- Use `sendClientEvent()` to send fresh app state back into the session when the model needs current context.
- Use `postToolResponse` for multi-step workflows where one tool result should lead to the next action.
- Use the ghost cursor only as visible confirmation for real UI changes, not as fake automation.
- Legacy `tokenEndpoint` and `getClientSecret` auth paths still work, but they are now compatibility options rather than the default quickstart.

## Docs

- [Docs overview](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Controller and runtime](./docs/controller-runtime.md)
- [Widget and ghost cursor](./docs/widget-and-cursor.md)
- [Demo architecture](./docs/demo-architecture.md)
