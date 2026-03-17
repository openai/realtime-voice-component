# Widget And Ghost Cursor

The package ships a small launcher widget and an optional ghost cursor. They are
useful together, but they solve different problems.

## VoiceControlWidget

`VoiceControlWidget` is a launcher UI, not a full assistant surface. It gives
you:

- connect and disconnect behavior
- a compact floating or inline launcher
- draggable floating mode
- optional corner snapping
- a small built-in error toast for failed connection attempts

## Widget Defaults And Limits

The widget requires an explicit controller and stays focused on launcher UI.

Important constraints:

- it is best for launcher-first flows
- it is not a transcript UI
- it is not designed to expose push-to-talk controls by itself
- if you need custom capture controls or richer state, use the controller directly

## Controller-Based Widget Integration

Use the widget when launcher UI is the right interaction model. If the
interaction model is wrong, use the controller directly instead of trying to
force the widget into a custom surface.

## Layout And Positioning

The widget supports:

- `layout="floating"` or `layout="inline"`
- `mobileLayout`
- `mobileBreakpoint`
- `persistPosition`
- `snapToCorners`
- `snapInset`
- `snapDefaultCorner`

The snap behavior is implemented with a viewport-aware corner-snap hook. In
floating mode, the snapped launcher is rendered through a portal to
`document.body`, which keeps the positioning tied to the viewport instead of a
local container.

## Styling

You can style the widget at three levels:

- default skin with `styles.css`
- themed skin with `className`, `partClassNames`, and CSS variable overrides
- unstyled shell with `unstyled`

Stable part names:

- `root`
- `overlay`
- `launcher`
- `launcher-toast`
- `launcher-action`
- `launcher-status`
- `launcher-label`
- `launcher-handle`
- `launcher-separator`
- `launcher-core`
- `launcher-indicator`
- `launcher-drag-glyph`

Use `unstyled` only when the launcher markup is still the right fit and you
mainly want your own visual treatment. If you need a different interaction
model, build a custom surface on the controller instead.

## Ghost Cursor

`useGhostCursor()` is a visual confirmation helper. It does not automate the
page. Your tool still performs the real state change.

The hook exposes:

- `cursorState`
- `run()`
- `runEach()`
- `hide()`

`GhostCursorOverlay` renders that state.

## How To Use The Cursor Well

The showcase demo is the place to study richer cursor choreography.

Useful details from the implementation:

- `from: "previous"` makes chained actions feel continuous
- the hook scrolls off-screen targets into view before animating
- reduced-motion users get simplified arrival feedback instead of travel animation
- scrolling, touch movement, and wheel input dismiss the cursor
- `runEach()` is good for sequences of field-by-field updates

## Cursor Best Practices

- target real elements whenever possible
- use it to confirm actual state changes, not to simulate them
- keep cursor motion secondary to the real app update
- use one tool per visible action so the cursor feedback stays understandable

## Recommended Split

- use the widget when you want a launcher quickly
- use the ghost cursor when you want visible confirmation
- use the controller directly when the widget is too opinionated
- keep wake word and richer interaction choreography in the showcase demo unless
  they become part of the package contract later
