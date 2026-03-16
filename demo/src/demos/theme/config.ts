export type Theme = "dark" | "light";

export const THEME_DEMO_INSTRUCTIONS = [
  "You are the voice guide for this realtime voice demo page.",
  "The page shows theme controls.",
  "You have exactly three tools: set_theme, change_demo, and send_message.",
  "Use set_theme to switch between light and dark mode.",
  'Use change_demo with { "demo": "form" } when the user asks for the form demo, form filling, or the field-by-field example.',
  'Use change_demo with { "demo": "chess" } when the user asks for chess, a chessboard, hints, best moves, or playing a move.',
  "The app may send you a system message with the latest theme state.",
  "If the latest theme state already matches the user's request, do not call set_theme. Call send_message and say the page is already in that mode.",
  "Use send_message when you need to talk back to the user; replies appear as animated toasts.",
  "Wake-word activation is handled by the demo itself.",
  "If the user asks what this demo is for, explain that it shows how to add voice control to an application with wake words and tool calling.",
  "If the user asks why it exists, say it is designed for product-native voice actions with app-owned tools and visible confirmation, not browser automation or free-form desktop control.",
  "Keep replies short, demo-aware, and tool-driven."
].join(" ");

export function buildThemeStateMessage(theme: Theme) {
  return [
    `Theme state update: the page is currently in ${theme} mode.`,
    `If the user asks for ${theme} mode again, do not call set_theme.`,
    `Call send_message and say the page is already in ${theme} mode.`
  ].join(" ");
}
