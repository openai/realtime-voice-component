# Controller And Runtime

The controller is the real core of the package. The widget is only a thin UI on
top of it.

## Two Ways To Use The Runtime

### 1. Let The Hook Own It

Use `useVoiceControl(options)` when your component can create and own the
runtime directly.

### 2. Create A Controller Yourself

Use `createVoiceControlController(options)` when you need to:

- share one session across multiple components or routes
- keep the same session alive across scene or tab changes
- reconnect the same runtime after UI changes
- update instructions or tools without recreating the whole tree
- build custom controls for connect, disconnect, and capture

The demo app uses this second pattern for its shared demo session across the
overview, theme, form, and chess routes. Because that controller lives above
route-specific tools, the provider boots with a neutral config and each active
demo reconfigures instructions and tools as it mounts.

## Ownership Rule

There are two valid ways to bind React to the runtime:

1. pass an external controller into `useVoiceControl(controller)`
2. pass options into `useVoiceControl(options)` and let the hook create one

That ownership choice matters:

- if you pass a controller, your app owns its lifecycle
- if you pass options, the hook creates, reconfigures, and destroys the
  controller for you

If you are retrofitting the package into an existing screen or product surface,
read [Integrating with an existing app](./integrating-with-an-existing-app.md)
for the recommended app-owned wrapper pattern and lifecycle pitfalls to avoid.

## What The Controller Tracks

The controller snapshot includes:

- `status`
- `activity`
- `connected`
- `transcript`
- `toolCalls`
- `latestToolCall`
- `sessionConfig`

`transcript` keeps the latest assembled transcript text, not a full transcript
history.

It also exposes methods for:

- `connect()` and `disconnect()`
- `startCapture()` and `stopCapture()`
- `updateInstructions()`
- `updateTools()`
- `updateSession()`
- `requestResponse()`
- `sendClientEvent()`
- `clearToolCalls()`

Controller-only methods:

- `configure(options)`
- `destroy()`
- `getSnapshot()`
- `subscribe(listener)`

## Connection Model

The runtime now defaults to a unified server-proxied WebRTC handshake:

- the browser creates the local SDP offer
- the runtime posts that SDP and the serialized session config to your app server
- your server forwards the multipart request to `POST https://api.openai.com/v1/realtime/calls`
- the browser receives the answer SDP and finishes the peer connection

Legacy client-secret bootstrap paths are still supported, but they are no
longer the primary flow in this repo.

The recommended auth contract is still `auth={{ sessionEndpoint: "/session" }}`.
Treat `tokenEndpoint` and `getClientSecret` as legacy compatibility paths.

Important controller behavior:

- it resets transcript and tool-call history on a fresh connect
- it keeps tool-call records with timing, args, outputs, and errors
- it surfaces runtime failures as normalized voice-control errors
- it can auto-connect when `autoConnect` is set

## Tool Execution Model

When the model emits function calls, the controller:

1. finds the matching registered tool
2. parses arguments through the tool's Zod schema
3. calls the app-owned `execute()`
4. sends a `function_call_output` back to the session
5. records success, error, or skipped state in tool-call history

If the model responds without selecting a tool while `outputMode` is
`"tool-only"`, the controller emits a local `voice.no_action` event and records
that as a skipped tool-call entry.

## Output Modes

The runtime supports:

- `tool-only`
- `text`
- `audio`
- `text+audio`

The demos use `tool-only`, which is the clearest mode when your app wants the
assistant to act rather than chat.

When tools are present and the output mode is `tool-only`, the session builder
defaults `tool_choice` to `required`.

## Activation Modes

The controller supports:

- `vad`
- `push-to-talk`

Important nuance:

- the packaged widget is designed around launcher-style VAD flows
- if you need push-to-talk, build custom UI on top of the controller or hook

## Turn Detection Defaults

For `activationMode: "vad"`, the session builder uses Realtime `server_vad` by
default. It intentionally does not default to `semantic_vad`.

Default VAD payload:

```ts
{
  type: "server_vad",
  threshold: 0.5,
  prefixPaddingMs: 300,
  silenceDurationMs: 200,
  createResponse: true,
}
```

For `"tool-only"` and `"text"` output modes, the default also includes
`interruptResponse: false`. These modes do not play assistant audio back to the
user, so new speech should not cancel an in-flight text response or function
call. If you enable audio output, the controller leaves response interruption at
the Realtime default so the user's voice can interrupt spoken playback.

## Sending State Back Into The Session

One of the most useful patterns in this repo is sending app state back as system
messages after the user interface changes.

The theme demo sends the current theme. The form demo sends the current field
state. That keeps the model grounded in what is actually visible on the page.

## Post-Tool Follow-Up Responses

Set `postToolResponse: true` when one tool result should naturally lead to the
next model step.

The form demo uses this pattern so the model can:

1. fill one field
2. receive the tool result
3. continue with the next field or ask for missing information

This is especially useful for multi-step workflows. It is not necessary for
single-action flows like theme switching.

## Session Mutation

You can adjust the live session without recreating the controller:

- `updateInstructions()` swaps instructions
- `updateTools()` swaps the live tool set
- `updateSession()` applies partial session patches

`updateSession()` merges runtime patches with the original options, including
nested audio config.

## Important Options

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

## Recommended Patterns

- reuse a controller when multiple surfaces need the same voice session
- keep tools in app code, not inside generic helpers
- send state updates after visible app changes
- use `postToolResponse` only when the next step should happen automatically
- prefer `tool-only` for deterministic UI control flows

## Escape Hatches

- `requestResponse()` sends `response.create`
- `sendClientEvent(event)` sends a raw client event through the transport
- `transportFactory` lets you inject a custom transport for tests or specialized
  runtimes
