# AI Practice Companion — Integration Example

A production integration of `realtime-voice-component` built for an AI knowledge platform with 243 articles. This example demonstrates two patterns that emerged from building real features on top of the library.

**Companion article:** [Voice as a State Controller — Building a Tool-Constrained Voice Interface on OpenAI Realtime](https://medium.com/@lakshmi_narayana_u) *(full implementation deep-dive)*

---

## Two Original Patterns

### 1. Fill-then-Submit

Voice fills the text input box as the user speaks (`update_draft`), but never submits automatically. The user must explicitly say *"send"*, *"go"*, or *"submit"* to fire `submit_question`. This keeps the user in control and prevents accidental submissions from natural speech pauses.

```
User speaks → update_draft (live in input) → ... → user says "send" → submit_question
```

The model is instructed with a strict `SUBMIT RULE` — this is the most important instruction in the system prompt because without it, the model will auto-submit on every pause.

### 2. Voice as a State Controller

Voice commands call the same React state handlers that buttons call. No parallel state machine. No shadow state. Voice is a third input channel (alongside keyboard and mouse) into the existing component state.

```
"start over"         →  handleReset()               ← same as Reset button
"business in trouble" →  setShowCrisisInline(true)   ← same as the panel button  
"ask about RAG"      →  handleSuggestedQuestion(q)  ← same as chip click
```

The `perform_action` tool dispatches typed action names to `dispatchVoiceAction` (a page-level function), which does fuzzy word-overlap matching against available UI presets and calls the correct handler. No cursor simulation needed.

---

## Files

| File | Purpose |
|---|---|
| `useAskVoiceController.ts` | Main hook — wires the controller to page state using the ref pattern |
| `voiceTools.ts` | Three input tools: `update_draft`, `submit_question`, `clear_draft` |
| `voiceNavigationTools.ts` | Navigation tool: `perform_action` with typed action enum |
| `dispatchVoiceAction.ts` | Page-level dispatcher — fuzzy matching + state handler calls |
| `server-session-proxy.ts` | Express route — SDP proxy with rate limiting (10/hr/IP) |
| `voice-animations.css` | CSS keyframe animations for voice confirmation feedback |

---

## Usage

### 1. Server setup

Register the SDP proxy route in your Express app:

```ts
import { registerVoiceRoutes } from "./server-session-proxy";
registerVoiceRoutes(app);
```

Set `OPENAI_API_KEY` in your environment. The route returns 503 if the key is missing.

### 2. Hook setup

```tsx
import { useAskVoiceController } from "./useAskVoiceController";
import { useVoiceControl, VoiceControlWidget } from "realtime-voice-component";

function AskPage() {
  const [query, setQuery] = useState("");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashingButton, setFlashingButton] = useState<{ type: string; idx: number } | null>(null);

  const dispatch = (action, label) =>
    dispatchVoiceAction(action, label, SUGGESTED_QS, CRISIS_QS, {
      handleSuggestedQuestion,
      handleReset,
      setShowCrisisInline,
      setQuery,
      setFlashingButton,
      flashTimerRef,
    });

  const { controller, voiceErrorKind } = useAskVoiceController(
    submitQuestion,   // your submit handler
    setQuery,         // your input setter
    handleBeforeSubmit, // optional: animate submit button
    () => query,      // optional: read live input value
    dispatch,         // optional: navigation dispatch
  );

  const voiceSnap = useVoiceControl(controller);

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <VoiceControlWidget controller={controller} />
      {/* flash .voice-button-flash on the matched chip */}
    </>
  );
}
```

### 3. CSS

Add `voice-animations.css` to your stylesheet. It requires a `--accent` CSS variable:

```css
:root { --accent: 217 91% 60%; }
```

---

## Ghost Cursor: Available, Evaluated, Not Used

This fork includes `useGhostCursor` and `GhostCursorOverlay` in the source. We read the implementation, understood what it does, and chose not to wire it up in this integration.

**Why:**
- In a chat-style layout, the target button can be 400–800 px from wherever the cursor currently sits.
- Ghost cursor travels that full distance (600–900 ms animation) before the action fires.
- The user watches a pointer move across the screen before anything happens.

**What we used instead:**
- CSS `voice-button-flash` keyframe: flashes the matched element in-place (0.55 s).
- `scheduleFlash` holds the action for 350 ms, fires immediately after.
- Total time from voice recognition to action: ~350 ms, with immediate visual confirmation.

**When to use ghost cursor instead:**
Ghost cursor is the right choice when you want to guide a user's attention to *where* an element is — a tutorial flow, a first-run walkthrough, or a demo. For routine voice commands in a practised UI, in-place flash is faster and less distracting.

---

## Rate Limiting & Costs

The server proxy rate-limits each IP to 10 voice sessions per hour. Each session uses the `gpt-4o-realtime-preview` model. Costs are billed per token (audio + text) by OpenAI. Monitor usage at platform.openai.com.

For production: replace the in-memory rate limiter with a Redis-backed one so limits persist across restarts and work correctly behind a load balancer.

---

## Model & Instructions

The system instructions enforce four strict rules:

| Rule | Behaviour |
|---|---|
| TRANSCRIPTION | Call `update_draft` as speech arrives, replacing (not appending) |
| SUBMIT | Only call `submit_question` on explicit trigger words |
| CLEAR | Call `clear_draft` on "clear", "cancel", "never mind" |
| NAVIGATION | Use `perform_action` for preset UI elements, `update_draft` for everything else |

The decision guide at the end of the instructions is important: *"When in doubt, use `update_draft`."* This prevents the model from routing ambiguous inputs to navigation when the user is just asking an open-ended question.
