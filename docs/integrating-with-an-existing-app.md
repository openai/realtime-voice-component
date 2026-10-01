# Integrating With An Existing App

This page is for teams who already have a React or Next.js app with existing
state, handlers, validation, and UI controls and want to add
`realtime-voice-component` without creating a second state system.

If you want the smallest greenfield example, start with
[Getting started](./getting-started.md). This page is about retrofitting voice
into a real app that already works.

## The Recommended Pattern: An App-Owned Voice Wrapper

For an existing app, the best default is a small app-owned wrapper or adapter
layer between the voice runtime and your real state transitions.

That wrapper should expose:

- `getState()`
- a narrow set of app actions
- optional helper actions like notifications, navigation, or focusing a control

The runtime calls tools. The tools call your wrapper. The wrapper calls your
existing app handlers.

That keeps the app as the source of truth and keeps business logic out of the
voice layer.

## Why This Pattern Works Best

Compared with wiring tool `execute()` callbacks directly to scattered hooks and
setters, the wrapper pattern:

- keeps the voice layer from becoming a second business-logic layer
- reuses your existing validation, normalization, permissions, and side effects
- keeps UI state changes in the same place they already live
- makes widget and controller debugging separate from app-state debugging
- makes it easier to test the integration boundary

Tiny demos can skip this and call local setters directly. Existing apps usually
should not.

## How To Wire It

The clean retrofit flow is:

1. create or hoist one explicit controller at the app layer that owns the
   voice-enabled surface
2. build a small wrapper from existing app hooks, handlers, and selectors
3. register narrow tools that call wrapper methods
4. mount `VoiceControlWidget` as a launcher-only surface
5. optionally use `GhostCursorOverlay` for visible confirmation of real UI
   changes

The wrapper can stay local to one screen. It does not need to become a global
service unless your app already wants that shape.

## Choose Ownership First

Before you wire tools or the widget, decide whether the voice surface belongs to
one screen or needs to stay alive across scene, tab, or route changes.

- single-screen ownership: create the controller inside the screen that owns the
  controls and initialize it with that screen's tool set immediately
- shared shell or provider ownership: hoist the controller above scene-level
  tools when the same session should survive navigation, tab changes, or demo
  switches

If the session needs to stay alive across scenes, that ownership decision should
come first. It changes where the controller lives, when tools are known, and
whether you should bootstrap a neutral controller before the active screen
mounts.

### Single-Screen Ownership

Use this when one screen owns the voice surface and already knows its tools.

```tsx
function OperatorScreen() {
  const tools = useMemo(() => buildOperatorTools(), []);
  const controllerOptions = useMemo(
    () => ({
      activationMode: "vad" as const,
      auth: { sessionEndpoint: "/session" },
      instructions: "Control only the current screen with the registered tools.",
      outputMode: "tool-only" as const,
      tools,
    }),
    [tools],
  );
  const [controller] = useState(() => createVoiceControlController(controllerOptions));

  useEffect(() => {
    controller.configure(controllerOptions);
  }, [controller, controllerOptions]);

  return <VoiceControlWidget controller={controller} snapToCorners />;
}
```

This is the simpler shape. The controller lives and dies with the screen.

### Shared Provider Ownership

Use this when one session should stay alive while the user switches scenes,
tabs, or routes.

```tsx
const VoiceSessionContext = createContext<VoiceControlController | null>(null);

export function VoiceSessionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() =>
    createVoiceControlController({
      activationMode: "vad",
      auth: { sessionEndpoint: "/session" },
      instructions: "A screen is about to register tools.",
      outputMode: "tool-only",
      tools: [],
    }),
  );

  useEffect(() => {
    return () => controller.destroy();
  }, [controller]);

  return <VoiceSessionContext.Provider value={controller}>{children}</VoiceSessionContext.Provider>;
}

export function BillingScene() {
  const controller = useContext(VoiceSessionContext);
  const tools = useMemo(() => buildBillingTools(), []);

  useEffect(() => {
    if (!controller) return;

    controller.configure({
      activationMode: "vad",
      auth: { sessionEndpoint: "/session" },
      instructions: "Use billing-screen tools only.",
      outputMode: "tool-only",
      tools,
    });
  }, [controller, tools]);

  return null;
}
```

This shape is worth the extra ceremony when you want the same voice session to
survive scene changes.

## Example Wrapper Shape

This is a representative pattern, not a required interface:

The `useEffect` in this example is intentional. It is not deriving React state
from props or state. It is synchronizing an external controller object with the
latest tool definitions, which is one of the cases where an Effect is the right
fit.

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  createVoiceControlController,
  defineVoiceTool,
  GhostCursorOverlay,
  VoiceControlWidget,
  useGhostCursor,
} from "realtime-voice-component";

export function ExistingScreen() {
  const [prompt, setPrompt] = useState("");
  const [scenarioId, setScenarioId] = useState("kanban");
  const [runStatus, setRunStatus] = useState<"idle" | "running">("idle");
  const { cursorState, run } = useGhostCursor();
  const stateRef = useRef({
    prompt,
    runStatus,
    scenarioId,
  });
  stateRef.current = {
    prompt,
    runStatus,
    scenarioId,
  };

  const voiceAdapter = useMemo(
    () => ({
      getState: () => stateRef.current,
      sendToast: (message: string) => {
        // Call your app's existing toast mechanism here.
        console.log(message);
      },
      setPrompt,
      setScenario: setScenarioId,
      startRun: async () => {
        // Reuse your existing start-run handler.
        setRunStatus("running");
      },
      stopRun: async () => {
        // Reuse your existing stop-run handler.
        setRunStatus("idle");
      },
    }),
    [setPrompt, setScenarioId],
  );

  const tools = useMemo(
    () => [
      defineVoiceTool({
        name: "get_screen_state",
        description: "Inspect the current app state before acting.",
        parameters: z.object({}),
        execute: () => ({
          ok: true,
          state: voiceAdapter.getState(),
        }),
      }),
      defineVoiceTool({
        name: "set_prompt",
        description: "Replace the current prompt.",
        parameters: z.object({
          prompt: z.string().min(1),
        }),
        execute: async ({ prompt }) => {
          await run({ element: document.getElementById("prompt-input") }, () =>
            voiceAdapter.setPrompt(prompt),
          );
          return { ok: true, prompt };
        },
      }),
      defineVoiceTool({
        name: "set_scenario",
        description: "Switch the selected scenario.",
        parameters: z.object({
          scenarioId: z.string().min(1),
        }),
        execute: ({ scenarioId }) => {
          voiceAdapter.setScenario(scenarioId);
          return { ok: true, scenarioId };
        },
      }),
      defineVoiceTool({
        name: "start_run",
        description: "Start the current run.",
        parameters: z.object({}),
        execute: async () => {
          await voiceAdapter.startRun();
          return { ok: true };
        },
      }),
      defineVoiceTool({
        name: "stop_run",
        description: "Stop the current run.",
        parameters: z.object({}),
        execute: async () => {
          await voiceAdapter.stopRun();
          return { ok: true };
        },
      }),
      defineVoiceTool({
        name: "send_message",
        description: "Show a short operator-facing message.",
        parameters: z.object({
          message: z.string().min(1),
        }),
        execute: ({ message }) => {
          voiceAdapter.sendToast(message);
          return { ok: true };
        },
      }),
    ],
    [run, voiceAdapter],
  );

  const controllerOptions = useMemo(
    () => ({
      activationMode: "vad" as const,
      auth: { sessionEndpoint: "/session" },
      instructions:
        "Use the provided tools to control the current screen. Prefer tools over free-form responses.",
      outputMode: "tool-only" as const,
      tools,
    }),
    [tools],
  );

  const [controller] = useState(() => createVoiceControlController(controllerOptions));

  useEffect(() => {
    // Sync the external controller with the latest tool set.
    controller.configure(controllerOptions);
  }, [controller, controllerOptions]);

  return (
    <>
      <input id="prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <GhostCursorOverlay state={cursorState} />
      <VoiceControlWidget controller={controller} snapToCorners />
    </>
  );
}
```

The important part is not the exact symbol names. The important part is the
boundary:

- UI state lives in your app
- tools delegate to wrapper methods
- wrapper methods delegate to existing app logic

This example does not call `useVoiceControl(controller)` in the parent because
the parent is not rendering runtime state. `VoiceControlWidget` already binds
to the controller internally. If your parent component needs to render
connection state, activity, or tool-call history, then use
`useVoiceControl(controller)` there.

The important `useMemo` calls in this pattern are about referential stability,
not generic optimization. A wrapper object or tool array that changes identity
every render will force `controller.configure(...)` to rerun every render too.

## More Practical Snippets

### Suggested File Split

If the integration is more than a toy example, create a few explicit files so
the voice layer does not leak across your screen component.

One good shape is:

```text
app/ui/operator-console/
  OperatorConsole.tsx
  voice/
    voiceAdapter.ts
    voiceTools.ts
    useOperatorVoiceController.ts
    VoicePanel.tsx
```

What each file owns:

- `voiceAdapter.ts`
  wraps existing handlers and exposes methods like `getState`, `setPrompt`,
  `startRun`, and `sendToast`
- `voiceTools.ts`
  defines `defineVoiceTool(...)` registrations against the adapter
- `useOperatorVoiceController.ts`
  creates or binds the controller, syncs controller config, and optionally sends
  fresh state back into the session
- `VoicePanel.tsx`
  renders runtime state, tool history, and `VoiceControlWidget`
- `OperatorConsole.tsx`
  stays focused on app state, layout, and passing real handlers into the voice
  layer

That is close to how the showcase demo is organized: keep config, tools, and
controller wiring in dedicated files instead of turning the screen component
into one large voice-integration block.

### Render Runtime State In The Parent

Call `useVoiceControl(controller)` in the parent only when the parent needs
runtime state for UI.

```tsx
function VoicePanel({ controller }: { controller: VoiceControlController }) {
  const runtime = useVoiceControl(controller);

  return (
    <aside>
      <p>Status: {runtime.status}</p>
      <p>Activity: {runtime.activity}</p>
      <p>Connected: {runtime.connected ? "yes" : "no"}</p>
      <button type="button" onClick={() => controller.clearToolCalls()}>
        Clear tool calls
      </button>
    </aside>
  );
}
```

If the parent does not render runtime state, skip this hook there and let
`VoiceControlWidget` bind to the controller internally.

### Send Fresh App State Back Into The Session

This is useful after a visible change when the model needs to know the new UI
state before choosing the next tool.

```tsx
useEffect(() => {
  if (!runtime.connected) {
    return;
  }

  controller.sendClientEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [
        {
          type: "input_text",
          text: `Current screen state: ${JSON.stringify(voiceAdapter.getState())}`,
        },
      ],
    },
  });
}, [controller, runtime.connected, voiceAdapter]);
```

Only do this when the next model step actually benefits from fresh state. Do
not spam the session with every render.

## State Management Rules

When you retrofit voice into an existing app, keep these rules in place:

- app state remains canonical
- tool `execute()` functions should delegate to wrapper methods, not inline
  scattered business logic
- the widget and controller should orchestrate actions, not replace your state
  model
- prefer stable tool definitions; if a tool only needs the latest state, read it
  through refs or stable selectors instead of rebuilding the whole tool set on
  every state change
- use Effects only to synchronize the external controller or other non-React
  systems, not to mirror React state into more React state
- use `useMemo` when identity stability is part of the integration contract,
  such as a wrapper object or tool array that feeds `controller.configure(...)`
- if the model needs fresh context, send app state back into the session after
  visible UI changes
- stable DOM ids are useful only when you need cursor confirmation or targeted
  control mapping

The ghost cursor is only confirmation. It should point at the real control that
changed. It should not become the mechanism that performs the state change.

## Controller Ownership And Lifecycle

The most important integration decision is who owns the controller.

There are two valid patterns:

- `useVoiceControl(options)` means the hook owns creation, reconfiguration, and
  teardown
- `useVoiceControl(controller)` or `VoiceControlWidget controller={controller}`
  means your app owns the controller lifecycle

For existing apps, the external-controller pattern is often the better fit
because it lets one screen, route provider, or app shell own the voice surface.

There are two common initialization shapes:

- if one screen owns the controller and already knows its tools, initialize the
  controller with the current tool list immediately
- if a provider or shell owns a controller above route-level tools, bootstrap a
  neutral controller first and reconfigure it as the active screen changes

The showcase demo in this repo uses the second pattern for its shared session
provider. That shape is useful when the same voice session should stay alive as
the user moves across scenes. For a single-screen integration, prefer the first
pattern and create the controller with the tools that screen already owns.

Important warning:

`useVoiceControl(options)` handles Strict Mode effect replay for the controller
it owns, starts automatic connections after mounting, and disposes that controller
after a real unmount. This does not manage externally created controllers.

- do not destroy an externally owned controller from a leaf component cleanup
- keep teardown decisions at the same layer that created the controller

This is especially important in React development mode and Strict Mode, where
remounts and cleanup can expose ownership bugs. A destroyed external controller
can leave a mounted widget holding a dead controller that never connects.

## Integration Gotchas

- choose ownership first
  if you need the same session to stay alive across scenes, hoist the
  controller before you start wiring tools
- do not destroy an externally owned controller from a leaf cleanup
  destroy it only at the same layer that created it
- do not rebuild the wrapper or tool array on every state change
  use refs for latest state reads and `useMemo` for identity stability
- do not call `useVoiceControl(controller)` in every component by default
  call it where you actually render runtime state
- do not assume an `idle` widget means the backend is broken
  if `/session` was never hit, the problem is still in client ownership,
  mounting, permissions, or browser media support
- do not rely on ghost-cursor motion as the state change itself
  the cursor is confirmation; your app handlers must still own the real update
- do not use the neutral `tools: []` bootstrap unless you truly need shared
  ownership across screens
  for a single screen, create the controller with the real tool list up front
- do not switch tool-only UI control flows to `semantic_vad` by default
  the controller's `server_vad` default also avoids interrupting an in-flight
  function call when the user starts speaking again

## Debugging Existing-App Integrations

Debug in this order.

### 1. Widget never leaves `idle`

If the widget stays at `idle` and never hits your `/session` endpoint, check:

- controller ownership and accidental destroy logic
- whether the widget is mounted and hydrated
- whether the runtime is being configured with tools and auth
- browser media and WebRTC support

Do not start by blaming the backend if the browser never tries to connect.

### 2. Widget moves to `error` before `/session`

Check client-side issues first:

- browser support
- microphone permission
- WebRTC/media availability
- client runtime errors in the browser console

### 3. `/session` is hit and fails

Then debug the backend path:

- API key wiring
- request proxying
- content type passthrough
- Realtime API response body and status

This separation matters because a healthy `/session` route does not help if the
client fails before it ever attempts the WebRTC handshake.

## When To Skip The Wrapper

Direct local setter wiring is still fine for:

- a very small single-component demo
- a first experiment where the app has almost no existing logic
- quick prototypes where the tool surface is tiny and temporary

For a real app, prefer the wrapper by default.

Also skip the packaged widget when launcher UI is the wrong interaction model.
If you need richer controls, transcript UI, or custom capture behavior, build a
custom surface on top of the controller instead.

## What To Read Next

- [Controller and runtime](./controller-runtime.md)
- [Widget and ghost cursor](./widget-and-cursor.md)
- [Showcase demo architecture](./demo-architecture.md)
