/**
 * useAskVoiceController.ts — Main integration hook
 *
 * Wires the realtime-voice-component controller to the page's existing
 * React state handlers. Key architectural choices:
 *
 * 1. REF PATTERN — All callbacks are stored in refs (not passed directly).
 *    This keeps the WebRTC session object stable for its full lifetime while
 *    still seeing fresh state on every call. No re-creating the session on
 *    every render.
 *
 * 2. VOICE AS STATE CONTROLLER — Voice tool calls invoke the same handlers
 *    that buttons call: setQuery(), submitQuestion(), handleReset(),
 *    setShowCrisisInline(). There is no parallel voice state machine.
 *    Voice is one more input channel, not a separate UI layer.
 *
 * 3. TOOL-ONLY OUTPUT MODE — outputMode: "tool-only" means the model never
 *    speaks aloud; it only calls tools. This keeps the UX silent (the user
 *    sees text, not audio feedback) and avoids double-output confusion.
 *
 * 4. EXPLICIT SUBMIT — The model is instructed never to auto-submit. Only
 *    explicit trigger words ("send", "go", "submit", "ask that") fire
 *    submit_question. This prevents accidental submissions on speech pauses.
 *
 * 5. ERROR CLASSIFICATION — VoiceControlError messages are mapped to two
 *    user-facing error kinds: "unavailable" (server not configured) and
 *    "connection" (transient WebRTC failure). The UI shows different
 *    banners for each.
 */

import { useRef, useState, useEffect } from "react";
import { createVoiceControlController } from "realtime-voice-component";
import type { VoiceControlController, VoiceControlError } from "realtime-voice-component";
import { buildAskVoiceTools } from "./voiceTools";
import { buildNavigationTools } from "./voiceNavigationTools";
import type { VoiceNavAction } from "./voiceNavigationTools";

export type { VoiceNavAction };
export type VoiceErrorKind = "unavailable" | "connection" | null;

function classifyVoiceError(error: VoiceControlError): VoiceErrorKind {
  const msg = error.message.toLowerCase();
  if (
    msg.includes("not configured") ||
    msg.includes("503") ||
    msg.includes("voice feature")
  ) {
    return "unavailable";
  }
  return "connection";
}

/**
 * @param submitQuestion  — calls the page's submit handler with a question string
 * @param setQuery        — sets the text input value
 * @param onBeforeSubmit  — optional: called just before submit (animate button, etc.)
 * @param getQuery        — optional: reads the current live input value
 * @param dispatch        — optional: handles navigation actions (VoiceNavAction)
 */
export function useAskVoiceController(
  submitQuestion: (text: string) => void,
  setQuery: (text: string) => void,
  onBeforeSubmit?: () => void,
  getQuery?: () => string,
  dispatch?: (action: VoiceNavAction, label?: string) => string,
): { controller: VoiceControlController; voiceErrorKind: VoiceErrorKind } {
  // Stable refs — updated on every render, never cause session recreation
  const submitQuestionRef = useRef<((text: string) => void) | null>(null);
  const setQueryRef = useRef<((text: string) => void) | null>(null);
  const onBeforeSubmitRef = useRef<(() => void) | null>(null);
  const getQueryRef = useRef<(() => string) | null>(null);
  const dispatchRef = useRef<((action: VoiceNavAction, label?: string) => string) | null>(null);

  const [voiceErrorKind, setVoiceErrorKind] = useState<VoiceErrorKind>(null);

  // Controller is created once — useState initializer runs only on mount.
  // The session endpoint proxies to OpenAI Realtime (see server-session-proxy.ts).
  const [controller] = useState(() =>
    createVoiceControlController({
      auth: { sessionEndpoint: "/api/voice-session" },
      activationMode: "vad",   // Voice Activity Detection — auto start/stop on speech
      outputMode: "tool-only", // Model calls tools only; never speaks aloud

      instructions: `You are the voice interface for an AI practice companion. Follow these rules exactly:

TRANSCRIPTION RULE:
- As the user speaks a freeform question, call update_draft with their words so the text appears in the input box.
- If the user keeps speaking and refines what they said, call update_draft again with the full updated text (replace, don't append).

SUBMIT RULE:
- NEVER submit automatically because the user paused.
- ONLY call submit_question when the user explicitly says: "submit", "send", "go", "ask that", or "ask it".
- When calling submit_question, pass the full draft text.

CLEAR RULE:
- Call clear_draft when the user says "clear", "cancel", "never mind", "erase that".

NAVIGATION RULE (use perform_action instead of update_draft ONLY for these):
- select_suggested_question: user says one of the preset question chips almost exactly.
- select_crisis_question: user says one of the crisis scenario buttons almost exactly.
- open_crisis_panel: user says "business in trouble", "show the crisis section", "open triage options".
- new_conversation: user says "start over", "reset", "new conversation".

DECISION GUIDE:
- Near-exact match to a preset chip label → perform_action
- Novel, original, or open-ended question → update_draft + wait for submit command
- When in doubt, use update_draft. Only route to perform_action when confident.
- Do not speak or reply in text. Only call tools.`,

      tools: [
        ...buildAskVoiceTools(submitQuestionRef, setQueryRef, onBeforeSubmitRef, getQueryRef),
        ...buildNavigationTools(dispatchRef),
      ],

      onError: (error: VoiceControlError) => {
        setVoiceErrorKind(classifyVoiceError(error));
      },
    }),
  );

  // Sync all callbacks into their refs on every render
  useEffect(() => { submitQuestionRef.current = submitQuestion; });
  useEffect(() => { setQueryRef.current = setQuery; });
  useEffect(() => { onBeforeSubmitRef.current = onBeforeSubmit ?? null; });
  useEffect(() => { getQueryRef.current = getQuery ?? null; });
  useEffect(() => { dispatchRef.current = dispatch ?? null; });

  // Auto-clear error state when a new session connects successfully
  useEffect(() => {
    if (voiceErrorKind === null) return;
    const unsubscribe = controller.subscribe(() => {
      const snap = controller.getSnapshot();
      if (snap.status !== "error" && snap.activity !== "error") {
        setVoiceErrorKind(null);
      }
    });
    return unsubscribe;
  }, [controller, voiceErrorKind]);

  return { controller, voiceErrorKind };
}
