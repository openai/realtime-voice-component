/**
 * voiceNavigationTools.ts — Voice-as-State-Controller navigation tool
 *
 * Pattern: Instead of cursor simulation (ghost cursor), voice commands call
 * the SAME React state handlers that buttons call. No parallel state machine.
 * No animation path. Voice is just another input channel into existing state.
 *
 * perform_action dispatches typed action names to a dispatchRef callback.
 * The callback (dispatchVoiceAction in the page) does fuzzy matching against
 * the available UI options and calls the correct handler.
 *
 * The label parameter carries the user's spoken words for fuzzy matching —
 * e.g. "ask about RAG" → scores against available question chip labels.
 */

import type { RefObject } from "react";
import { z } from "zod";
import { defineVoiceTool } from "realtime-voice-component";
import type { VoiceTool } from "realtime-voice-component";

/**
 * The set of UI actions voice can trigger.
 * Extend this enum as you add new UI panels or presets.
 */
export type VoiceNavAction =
  | "select_suggested_question"  // Click a preset question chip
  | "select_crisis_question"     // Click a crisis scenario button
  | "open_crisis_panel"          // Expand a collapsible panel
  | "new_conversation";          // Reset to initial state

export function buildNavigationTools(
  /**
   * Ref to dispatchVoiceAction — the page-level function that maps
   * VoiceNavAction values to actual React state updates.
   */
  dispatchRef: RefObject<((action: VoiceNavAction, label?: string) => string) | null>,
): VoiceTool[] {
  return [
    /**
     * perform_action — the single navigation tool.
     *
     * The model calls this instead of update_draft when the user's intent
     * is to interact with a UI element (a button, panel, or preset chip)
     * rather than compose a freeform question.
     *
     * Design decision: one tool with a typed action enum is easier for the
     * model to reason about than many narrow tools (one per button). It also
     * keeps the tool list short, which reduces token cost per session.
     */
    defineVoiceTool({
      name: "perform_action",
      description:
        "Navigate or interact with a UI element on the page by name. " +
        "Use this instead of update_draft when the user wants to click a " +
        "button or open a panel.",
      parameters: z.object({
        action: z
          .enum([
            "select_suggested_question",
            "select_crisis_question",
            "open_crisis_panel",
            "new_conversation",
          ])
          .describe("Which UI action to perform"),
        label: z
          .string()
          .optional()
          .describe(
            "For select_suggested_question or select_crisis_question: " +
            "the topic or question text the user mentioned. " +
            "Used for fuzzy matching against available chip labels.",
          ),
      }),
      execute: async ({ action, label }) => {
        const result = dispatchRef.current?.(action, label);
        return result ?? "I couldn't find that option.";
      },
    }),
  ];
}
