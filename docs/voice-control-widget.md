# Voice control widget

`VoiceControlWidget` is the packaged launcher UI.

Use it when you want a working voice launcher quickly without building your own
shell first.

## What it does

- renders a launcher-only voice control surface
- connects and disconnects from the launcher
- supports floating drag behavior
- supports saved position with `persistPosition`
- supports viewport corner snapping with `snapToCorners`
- supports `floating` and `inline` layouts

It does not render a transcript panel, chat UI, tool-call list, or expanded
debug surface.

## Use it with a controller

```tsx
<VoiceControlWidget controller={controller} snapToCorners />
```

Create the controller with `createVoiceControlController()` and pass it into the
widget.

## Important props

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
- `labels`
- `layout`
- `mobileLayout`
- `mobileBreakpoint`
- `unstyled`

`controllerRef` gives you direct access to the controller passed into the widget:

```tsx
const controllerRef = { current: null };
const controller = createVoiceControlController({
  auth: { sessionEndpoint: "/session" },
  tools
});

<VoiceControlWidget
  controller={controller}
  controllerRef={controllerRef}
/>
```

## Layout and movement

Useful behavior props:

- `draggable` controls drag behavior
- `persistPosition` stores the last position in local storage
- `snapToCorners` pins the widget to a viewport corner
- `snapInset` controls the distance from the viewport edge
- `snapDefaultCorner` sets the starting corner when there is no saved position
- `mobileLayout` lets you switch to inline mode on small screens

If you enable `snapToCorners`, the widget renders an `overlay` part while
floating.

## Styling

You have three styling levels:

- default skin: import `realtime-voice-component/styles.css`
- themed skin: keep the default CSS and override `--vc-*` variables
- unstyled shell: pass `unstyled` and style the stable `data-vc-part` structure yourself

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

## When to move on

Move to `createVoiceControlController()` and `useVoiceControl()` when:

- you need a custom launcher or embedded control
- you want transcript, debug, or analytics UI
- you want different markup instead of restyling the packaged launcher
- you need tighter control over the controller lifecycle
