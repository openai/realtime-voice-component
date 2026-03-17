# Headless runtime

`createVoiceControlController()` is the runtime behind the packaged widget.
`useVoiceControl()` is the React binding for that runtime.

Use this path when you want your own voice UI but do not want to rebuild the
transport, session, and tool-execution logic.

## What the runtime owns

- connect and disconnect lifecycle
- Realtime transport setup
- transcript assembly from Realtime events
- push-to-talk and VAD capture behavior
- tool execution
- tool-call history
- the resolved Realtime session config used by the transport

It does not own widget layout, drag behavior, or launcher markup.

## Create one controller outside React

```tsx
import {
  createVoiceControlController,
  useVoiceControl
} from "realtime-voice-component";

const controller = createVoiceControlController({
  auth: { sessionEndpoint: "/session" },
  instructions: "Use the provided tools.",
  outputMode: "tool-only",
  tools
});

export function VoiceToolbarButton() {
  const runtime = useVoiceControl(controller);

  return (
    <button
      aria-pressed={runtime.connected}
      onClick={() => {
        if (runtime.connected) {
          runtime.disconnect();
          return;
        }

        void runtime.connect();
      }}
      type="button"
    >
      {runtime.connected ? "Disconnect voice" : "Start voice"}
    </button>
  );
}
```

This is the right model when you want to reuse one controller across routes or
UI surfaces. The demo app does this with `DemoSessionProvider`.

## Or let the hook own the controller

```tsx
const runtime = useVoiceControl({
  auth: { sessionEndpoint: "/session" },
  instructions: "Use the provided tools.",
  outputMode: "tool-only",
  tools
});
```

When you pass options instead of a controller, the hook creates the controller
for you and keeps it configured as the options change.

## Runtime state

The main state values are:

- `status`
- `activity`
- `connected`
- `transcript`
- `toolCalls`
- `latestToolCall`
- `sessionConfig`

`transcript` keeps the latest assembled transcript text, not a full transcript
history.

## Runtime methods

The main methods are:

- `connect()`
- `disconnect()`
- `startCapture()`
- `stopCapture()`
- `clearToolCalls()`
- `updateInstructions(instructions)`
- `updateTools(tools)`
- `updateSession(patch)`
- `requestResponse()`
- `sendClientEvent(event)`

Controller-only methods:

- `configure(options)`
- `destroy()`
- `getSnapshot()`
- `subscribe(listener)`

## Important options

Useful runtime options:

- `auth`
- `tools`
- `instructions`
- `model`
- `activationMode`
- `outputMode`
- `postToolResponse`
- `autoConnect`
- `debug`
- `maxToolCallHistory`

Advanced Realtime options:

- `session`
- `audio`
- `include`
- `maxOutputTokens`
- `prompt`
- `toolChoice`
- `tracing`
- `truncation`

`maxToolCallHistory` defaults to a bounded history. Pass `null` for unlimited
history.

If `outputMode` is `"tool-only"` and tools are present, the runtime defaults
`tool_choice` to `required`.

## Session patching

Use `updateSession(patch)` when you need to change the live session without
rebuilding the controller.

```tsx
runtime.updateSession({
  metadata: { surface: "inline" },
  raw: {
    temperature: 0.4
  }
});
```

## Post-tool follow-ups

Set `postToolResponse: true` when you want the model to continue after each tool
call.

The form demo uses this pattern so the model can keep filling fields after each
successful tool call.

## Escape hatches

- `requestResponse()` sends `response.create`
- `sendClientEvent(event)` sends a raw client event through the transport
- `transportFactory` lets you inject a custom transport for tests or specialized runtimes
