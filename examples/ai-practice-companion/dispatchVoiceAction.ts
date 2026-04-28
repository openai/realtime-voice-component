/**
 * dispatchVoiceAction.ts — Voice-as-State-Controller bridge
 *
 * This is the page-level function that receives a VoiceNavAction and
 * maps it to the correct React state update. It is the core of the
 * "voice as state controller" pattern.
 *
 * Key points:
 *
 * 1. SAME HANDLERS — voice calls handleReset(), setShowCrisisInline(),
 *    handleSuggestedQuestion() — the exact same functions the buttons call.
 *    There is no separate voice state machine.
 *
 * 2. FUZZY MATCHING — The model passes a `label` string (the user's spoken
 *    words). We score each preset option by how many words from the label
 *    appear in it, then pick the highest-scoring match. This handles
 *    partial matches gracefully ("ask about RAG" → matches "RAG: Retrieval
 *    Augmented Generation in Practice").
 *
 * 3. FLASH ANIMATION — Before submitting, we flash the matched button for
 *    350 ms using a CSS class. This gives the user visual confirmation that
 *    the right option was recognised before it fires. The animation does NOT
 *    use ghost cursor — it is a CSS keyframe on the element itself.
 *
 * 4. FALLBACK — If no match scores > 0, we fall the text back into the
 *    input box via setQuery() so the user can refine and submit manually.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Adapting this for your app:
 *
 * - Replace SUGGESTED_QUESTIONS and CRISIS_QUESTIONS with your preset lists.
 * - Replace handleSuggestedQuestion, handleReset, setShowCrisisInline with
 *   your own state handlers.
 * - Add new action cases to the switch-like if-chain as you add UI panels.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { VoiceNavAction } from "./voiceNavigationTools";

// ── Types your page provides ──────────────────────────────────────────────

interface SuggestedQuestion {
  text: string; // The full chip label
}

interface FlashingButton {
  type: "suggested" | "crisis";
  idx: number;
}

// ── The dispatch function ─────────────────────────────────────────────────

/**
 * @param action        — typed action from the voice model
 * @param label         — user's spoken words (for fuzzy matching)
 * @param suggestedQs   — your preset question chips
 * @param crisisQs      — your crisis scenario buttons
 * @param handlers      — your page's state handlers
 */
export function dispatchVoiceAction(
  action: VoiceNavAction,
  label: string | undefined,

  suggestedQs: string[],
  crisisQs: SuggestedQuestion[],

  handlers: {
    handleSuggestedQuestion: (text: string) => void;
    handleReset: () => void;
    setShowCrisisInline: (show: boolean) => void;
    setQuery: (text: string) => void;
    setFlashingButton: (b: FlashingButton | null) => void;
    flashTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  },
): string {
  const lbl = (label ?? "").toLowerCase().trim();
  const labelWords = lbl.split(/\s+/).filter((w) => w.length >= 2);

  const { handleSuggestedQuestion, handleReset, setShowCrisisInline,
          setQuery, setFlashingButton, flashTimerRef } = handlers;

  /**
   * scheduleFlash — flashes the matched button for 350 ms, then fires.
   *
   * This is the alternative to ghost cursor: instead of animating a pointer
   * from its current position to the button (which can travel far and looks
   * mechanical), we flash the button in-place. The user sees confirmation
   * immediately, and the action fires in under half a second.
   */
  const scheduleFlash = (
    type: "suggested" | "crisis",
    idx: number,
    submit: () => void,
  ) => {
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    setFlashingButton({ type, idx });
    flashTimerRef.current = setTimeout(() => {
      submit();
      setFlashingButton(null);
      flashTimerRef.current = null;
    }, 350);
  };

  // ── select_suggested_question ──────────────────────────────────────────
  if (action === "select_suggested_question") {
    // Score each chip by word overlap with the user's spoken label
    const scored = suggestedQs
      .map((q, idx) => ({
        q,
        idx,
        score: labelWords.filter((w) => q.toLowerCase().includes(w)).length,
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0) {
      const { q, idx } = scored[0];
      scheduleFlash("suggested", idx, () => handleSuggestedQuestion(q));
      return `Selected: "${q}"`;
    }

    // No match — fall back to freeform input
    if (lbl) setQuery(lbl);
    return "I couldn't find that option.";
  }

  // ── select_crisis_question ─────────────────────────────────────────────
  if (action === "select_crisis_question") {
    const scored = crisisQs
      .map((q, idx) => ({
        q,
        idx,
        score: labelWords.filter((w) => q.text.toLowerCase().includes(w)).length,
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0) {
      const { q, idx } = scored[0];
      scheduleFlash("crisis", idx, () => handleSuggestedQuestion(q.text));
      return `Selected: "${q.text}"`;
    }

    if (lbl) setQuery(lbl);
    return "I couldn't find that option.";
  }

  // ── open_crisis_panel ──────────────────────────────────────────────────
  if (action === "open_crisis_panel") {
    setShowCrisisInline(true);           // same handler the "Business in Trouble" button calls
    return "Opened the Business in Trouble panel.";
  }

  // ── new_conversation ───────────────────────────────────────────────────
  if (action === "new_conversation") {
    handleReset();                       // same handler the Reset button calls
    return "Started a new conversation.";
  }

  return "I couldn't find that option.";
}
