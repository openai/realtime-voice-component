# Getting Started

This package is easiest to understand as a pattern:

1. your browser sends SDP and session config to your backend
2. your app registers narrow tools
3. the runtime exposes those tools to Realtime
4. your UI performs the actual state change
5. your app shows the result visibly

## What To Build First

Start with one tool and one visible action.

The theme demo in this repo is the clearest first integration path. If you
already know you do not want the packaged widget, build your own small surface
on top of `createVoiceControlController()` and `useVoiceControl()`.

## Install From A Local Checkout

This package currently supports local installation only. From your app, install
it from a clone of this repo:

```bash
corepack pnpm add ../path/to/realtime-voice-component zod
```

Replace `../path/to/realtime-voice-component` with the path to your local clone.
Once installed, import it as `realtime-voice-component`.

## Authentication

The canonical browser auth path is:

- `auth={{ sessionEndpoint: "/session" }}`

Legacy compatibility paths still exist:

- `auth={{ tokenEndpoint: "/token" }}` for the older client-secret flow
- `auth={{ getClientSecret: async () => "..." }}`

This route should leave the incoming multipart body untouched unless you
intentionally want to merge or override session settings on the server.

Example server endpoint:

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

## First Working Example

Start with one tool, one visible control, and an explicit controller:

```tsx
import { useState } from "react";
import { z } from "zod";
import {
  createVoiceControlController,
  defineVoiceTool,
  VoiceControlWidget
} from "realtime-voice-component";
import "realtime-voice-component/styles.css";

type Theme = "light" | "dark";

export function ThemeExample() {
  const [theme, setTheme] = useState<Theme>("light");

  const controller = createVoiceControlController({
    auth: { sessionEndpoint: "/session" },
    instructions: "Use the registered tools to control the page. Prefer tools over chat.",
    outputMode: "tool-only",
    tools: [
      defineVoiceTool({
        name: "set_theme",
        description: "Switch the page theme between light and dark mode.",
        parameters: z.object({
          theme: z.enum(["light", "dark"])
        }),
        execute: async ({ theme }) => {
          setTheme(theme);
          return { ok: true, theme };
        }
      })
    ]
  });

  return (
    <>
      <button type="button">
        Current theme: {theme}
      </button>
      <VoiceControlWidget controller={controller} snapToCorners />
    </>
  );
}
```

## Recommended Defaults

- use `outputMode="tool-only"` for UI action flows
- keep the tool list small and specific
- use an explicit controller for the widget
- use `auth={{ sessionEndpoint: "/session" }}` as the default WebRTC bootstrap path
- use `activationMode="vad"` with the packaged widget
- send current app state back into the session when the model needs fresh context
- make the app, not the model, responsible for confirming success

## What To Read Next

- [Architecture choices](./architecture-choices.md)
- [Controller and runtime](./controller-runtime.md)
- [Widget and ghost cursor](./widget-and-cursor.md)
- [Showcase demo architecture](./demo-architecture.md)
