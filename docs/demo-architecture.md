# Demo Architecture

The demo app is the main showcase for how this package is meant to be used. It
shows both the happy path and the patterns that scale better than a single
inline integration.

## Overall Structure

The demo app has four routes:

- overview
- theme demo
- form demo
- chess demo

All four routes sit inside `DemoSessionProvider`, which owns one shared
controller for the whole demo app.

The overview route configures that shared controller with an inert overview
session. The theme, form, and chess routes reuse the same controller with
route-specific instructions and tools.

## Shared Controller Pattern

`DemoSessionProvider` creates one controller up front and keeps it alive across
route changes.

The demo uses the unified `/session` flow, so the browser sends SDP plus the
current session config to the local demo server and that server forwards the
multipart request to OpenAI with the standard API key.

When the active interactive demo changes, the provider:

1. disconnects the old session
2. clears tool-call history
3. reconfigures the controller with the next demo's instructions and tools
4. reconnects automatically if the previous demo was already live

This is a good pattern when your UI can switch views but should still feel like
one voice-enabled product.

## Theme Demo

The theme demo keeps the tool surface intentionally tiny:

- `set_theme`
- `change_demo`
- `send_message`

Important patterns:

- the theme state is sent back to the model as a system message after changes
- redundant requests are handled in app logic instead of hoping the model remembers
- the ghost cursor points at the actual button that changed

This is the best example of a first integration.

## Form Demo

The form demo shows a more structured workflow:

- `set_field`
- `get_unfilled_fields`
- `submit_form`
- `change_demo`
- `send_message`

Important patterns:

- one field per tool call
- app-side validation and normalization
- `postToolResponse: true` so the model can continue after each tool result
- a separate tool for discovering missing data instead of relying on guesswork

This is the best example of a multi-step integration.

## Wake Word Layer

Wake-word activation is not part of the core package contract. The demo layers
it on top with Porcupine.

Important design choice:

- the wake-word flow only activates the widget when it is idle
- once activation succeeds, the wake-word microphone is released so WebRTC can
  own capture for the live session

That keeps the wake word optional and separate from the core voice runtime.

## Best Practices The Demo Teaches

- keep the assistant constrained to app-owned tools
- send current UI state back into the session when the model needs fresh context
- prefer one precise tool call over a fuzzy multi-action tool
- let the app own validation, submission rules, and confirmation
- reuse a controller when multiple views are really one voice surface

## What To Reuse In Your App

Most apps should copy these ideas, not the exact demo code:

- narrow tools
- explicit state sync
- visible confirmation
- app-owned validation
- controller reuse where it simplifies routing or complex UI

## What Should Stay Demo-Only

- wake-word activation
- richer choreography and showcase polish
- larger multi-route teaching surfaces that are useful to study but harder to
  copy directly
