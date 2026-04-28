/**
 * voiceTools.ts — Fill-then-Submit input tools
 *
 * Pattern: Voice fills the text input box as the user speaks, but NEVER
 * submits automatically. The user must explicitly say "send" / "go" / "submit"
 * to trigger the submit. This keeps the user in control and prevents
 * accidental submissions from pauses in speech.
 *
 * Usage:
 *   const tools = buildAskVoiceTools(submitRef, setQueryRef, onBeforeSubmitRef, getQueryRef);
 *   // Pass tools to createVoiceControlController({ tools })
 *
 * Ref pattern: All callbacks are stored in refs so they never go stale inside
 * the WebRTC session, even when the parent component re-renders.
 */

import type { RefObject } from "react";
import { z } from "zod";
import { defineVoiceTool } from "realtime-voice-component";
import type { VoiceTool } from "realtime-voice-component";

export function buildAskVoiceTools(
  /** Ref to the function that submits the question */
  submitQuestionRef: RefObject<((text: string) => void) | null>,
  /** Ref to the function that updates the input field */
  setQueryRef: RefObject<((text: string) => void) | null>,
  /** Optional: called just before submit (e.g. focus button, play animation) */
  onBeforeSubmitRef: RefObject<(() => void) | null>,
  /** Optional: reads the current live input value (for submit with latest text) */
  getQueryRef: RefObject<(() => string) | null>,
): VoiceTool[] {
  return [
    /**
     * update_draft — streams transcription into the input box.
     *
     * Always replaces the full text (not appended) so corrections work cleanly.
     * Does NOT submit. The model is instructed never to auto-submit on pause.
     */
    defineVoiceTool({
      name: "update_draft",
      description:
        "Update the text input box with the user's transcribed speech. " +
        "Call this as the user speaks to show their words in the input. " +
        "Always replace the full draft with the latest complete transcription. " +
        "Do NOT submit.",
      parameters: z.object({
        text: z
          .string()
          .describe("The full transcribed text to place in the input box"),
      }),
      execute: async ({ text }) => {
        setQueryRef.current?.(text);
        return "Draft updated.";
      },
    }),

    /**
     * submit_question — explicit submit trigger only.
     *
     * Only fires when the user says one of the explicit trigger words.
     * Reads the live input value at submit time (not the stale AI transcription)
     * so any edits the user typed while speaking are preserved.
     */
    defineVoiceTool({
      name: "submit_question",
      description:
        "Submit the question to the AI. " +
        "ONLY call this when the user explicitly says one of: " +
        "'submit', 'send', 'go', 'ask that', 'ask it'. " +
        "Pass the complete text to submit.",
      parameters: z.object({
        text: z.string().describe("The complete question text to submit"),
      }),
      execute: async ({ text }) => {
        // Prefer the live input value over the AI's transcription —
        // the user may have typed corrections since speaking.
        const liveText = getQueryRef.current?.() ?? text;
        onBeforeSubmitRef.current?.();
        submitQuestionRef.current?.(liveText || text);
        return "Question submitted.";
      },
    }),

    /**
     * clear_draft — clears the input box on command.
     *
     * Triggered by "clear", "cancel", "never mind", "erase that".
     * NOT used for "start over" — that is a navigation action.
     */
    defineVoiceTool({
      name: "clear_draft",
      description:
        "Clear the text input when the user says 'clear', 'cancel', " +
        "'never mind', or 'erase that'. " +
        "Do NOT use this for 'start over' — that is a navigation action.",
      parameters: z.object({}),
      execute: async () => {
        setQueryRef.current?.("");
        return "Input cleared.";
      },
    }),
  ];
}
