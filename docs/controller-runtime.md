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
- reconnect the same runtime after UI changes
- update instructions or tools without recreating the whole tree
- build custom controls for connect, disconnect, and capture

The demo app uses this second pattern for the interactive demos.

## What The Controller Tracks

The controller snapshot includes:

- `status`
- `activity`
- `connected`
- `transcript`
- `toolCalls`
- `latestToolCall`
- `sessionConfig`

It also exposes methods for:

- `connect()` and `disconnect()`
- `startCapture()` and `stopCapture()`
- `updateInstructions()`
- `updateTools()`
- `updateSession()`
- `requestResponse()`
- `sendClientEvent()`
- `clearToolCalls()`

## Connection Model

The runtime resolves a client secret first, then opens a browser WebRTC session
to `POST https://api.openai.com/v1/realtime/calls`.

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

## Sending State Back Into The Session

One of the most useful patterns in this repo is sending app state back as system
messages after the user interface changes.

The theme demo sends the current theme. The form demo sends the current field
state. That keeps the model grounded in what is actually visible on the page.

Example:

```ts
controller.sendClientEvent({
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "system",
    content: [
      {
        type: "input_text",
        text: buildCurrentStateMessage()
      }
    ]
  }
});
```

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

## Recommended Patterns

- reuse a controller when multiple surfaces need the same voice session
- keep tools in app code, not inside generic helpers
- send state updates after visible app changes
- use `postToolResponse` only when the next step should happen automatically
- prefer `tool-only` for deterministic UI control flows
