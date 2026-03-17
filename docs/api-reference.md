# API reference

This page is the short version.

If you want the generated reference tree, start with [`./api/README.md`](./api/README.md).

## Main exports

- `defineVoiceTool(definition)`
- `createVoiceControlController(options)`
- `useVoiceControl(optionsOrController)`
- `useGhostCursor(options)`
- `GhostCursorOverlay(props)`
- `VoiceControlWidget(props)`
- `realtime-voice-component/styles.css`

## `defineVoiceTool(definition)`

Use this to register a tool the assistant is allowed to call.

Important detail: `defineVoiceTool()` expects a Zod schema. Plain JSON Schema
tool definitions are rejected at runtime.

## `UseVoiceControlOptions`

Core options:

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

Callbacks and transport hooks:

- `onEvent`
- `onToolStart`
- `onToolSuccess`
- `onToolError`
- `onError`
- `transportFactory`

Auth options:

- `auth={{ sessionEndpoint: "/session" }}`
- `auth={{ sessionEndpoint: "/session", sessionRequestInit }}`
- `auth={{ tokenEndpoint: "/token" }}`
- `auth={{ tokenEndpoint: "/token", tokenRequestInit }}`
- `auth={{ getClientSecret }}`

## `outputMode`

Supported values:

- `"tool-only"`
- `"text"`
- `"audio"`
- `"text+audio"`

Current runtime behavior:

- `"tool-only"` and `"text"` send text output modalities
- `"audio"` and `"text+audio"` currently send audio output modalities
- audio output modes use `semantic_vad` by default
- non-audio output modes use `server_vad` with a 200ms silence window by default

## `UseVoiceControlReturn`

State:

- `status`
- `activity`
- `connected`
- `transcript`
- `toolCalls`
- `latestToolCall`
- `sessionConfig`

Methods:

- `clearToolCalls()`
- `connect()`
- `disconnect()`
- `startCapture()`
- `stopCapture()`
- `updateInstructions(instructions)`
- `updateTools(tools)`
- `updateSession(patch)`
- `requestResponse()`
- `sendClientEvent(event)`

## `VoiceControlWidgetProps`

`VoiceControlWidgetProps` requires:

- a `controller` built with `createVoiceControlController()`

Widget-specific props:

- `controller`
- `controllerRef`
- `widgetId`
- `className`
- `draggable`
- `persistPosition`
- `snapToCorners`
- `snapInset`
- `snapDefaultCorner`
- `partClassNames`
- `layout`
- `mobileLayout`
- `mobileBreakpoint`
- `labels`
- `unstyled`

## `UseGhostCursorReturn`

- `cursorState`
- `run(target, operation, options?)`
- `runEach(items, resolveTarget, operation, options?)`
- `hide()`

Useful ghost cursor behavior:

- supports `from: "pointer" | "previous" | point`
- hides after scroll
- respects reduced motion
- surfaces an error phase if the wrapped operation throws
