# Getting Started

This package is easiest to understand as a pattern:

1. your backend mints a short-lived Realtime client secret
2. your app registers narrow tools
3. the runtime exposes those tools to Realtime
4. your UI performs the actual state change
5. your app shows the result visibly

## What To Build First

Start with one tool and one visible action. The theme demo in this repo is the
best example of the intended first integration.

## Install From A Local Checkout

This package currently supports local installation only. From your app, install
it from a clone of this repo:

```bash
npm add ../path/to/realtime-voice-component zod
```

Replace `../path/to/realtime-voice-component` with the path to your local clone.
Once installed, import it as `realtime-voice-component`.

## Authentication

The runtime accepts either:

- `auth={{ tokenEndpoint: "/token" }}`
- `auth={{ getClientSecret: async () => "..." }}`

When you use `tokenEndpoint`, the runtime makes a `GET` request to:

```txt
{tokenEndpoint}?model={model}
```

It accepts any of these JSON shapes:

```json
{ "value": "rtm_..." }
```

```json
{ "client_secret": "rtm_..." }
```

```json
{ "client_secret": { "value": "rtm_..." } }
```

Example server endpoint:

```ts
app.get("/token", async (request, response) => {
  const realtimeResponse = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model:
            typeof request.query.model === "string"
              ? request.query.model
              : "gpt-realtime-1.5",
          output_modalities: ["text"]
        }
      })
    }
  );

  const payload = await realtimeResponse.json();
  const value =
    payload.value ??
    (typeof payload.client_secret === "object" && payload.client_secret !== null
      ? payload.client_secret.value
      : payload.client_secret);

  response.json({ ...payload, value });
});
```

## Define A Tool

Tools must use Zod schemas. Plain JSON Schema is intentionally rejected by
`defineVoiceTool()`.

```tsx
import { defineVoiceTool } from "realtime-voice-component";
import { z } from "zod";

const setThemeTool = defineVoiceTool({
  name: "set_theme",
  description: "Switch the page theme between light and dark mode.",
  parameters: z.object({
    theme: z.enum(["light", "dark"])
  }),
  execute: async ({ theme }) => {
    document.documentElement.dataset.theme = theme;
    return { ok: true, theme };
  }
});
```

## Create A Controller And Render The Widget

Create a controller explicitly and pass it to the widget.

```tsx
import {
  createVoiceControlController,
  VoiceControlWidget
} from "realtime-voice-component";
import "realtime-voice-component/styles.css";

const controller = createVoiceControlController({
  auth: { tokenEndpoint: "/token" },
  instructions: "Use the registered tools to control the page. Prefer tools over chat.",
  outputMode: "tool-only",
  tools: [setThemeTool]
});

export function Example() {
  return <VoiceControlWidget controller={controller} snapToCorners />;
}
```

## Add Visible Confirmation

The package works best when the user can see what changed. The demos use the
ghost cursor for this. It is optional, but it is a good pattern for actions
that target visible controls.

```tsx
import {
  GhostCursorOverlay,
  useGhostCursor
} from "realtime-voice-component";

const cursor = useGhostCursor();

const setThemeTool = defineVoiceTool({
  name: "set_theme",
  description: "Switch the page theme between light and dark mode.",
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
});

return <GhostCursorOverlay state={cursor.cursorState} />;
```

## Recommended Defaults

- use `outputMode="tool-only"` for UI action flows
- keep the tool list small and specific
- use an explicit controller for the widget
- use `activationMode="vad"` with the packaged widget
- send current app state back into the session when the model needs fresh context
- make the app, not the model, responsible for confirming success

## What To Read Next

- [Controller and runtime](./controller-runtime.md)
- [Widget and ghost cursor](./widget-and-cursor.md)
- [Demo architecture](./demo-architecture.md)
