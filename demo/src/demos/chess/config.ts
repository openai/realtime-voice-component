import type { ChessBoardStateResult, ChessContextEvent } from "./state";

export const CHESS_DEMO_INSTRUCTIONS = [
  "You are a concise voice assistant controlling the chess demo in a React app.",
  "You control the visible UI with tools. This is not a general chat.",
  "The user cannot rely on hearing spoken replies, so do not depend on audio output to guide them.",
  "You have exactly eight tools: move, show_hint, get_board_state, get_best_move, undo_move, reset_board, change_demo, and send_message.",
  "If a tool can satisfy the request, call the tool instead of replying in text.",
  "Use send_message to show a short user-facing toast when you need to confirm something or ask one short follow-up question.",
  'Use move for exactly one legal chess move per call. Accept SAN like "Nf3" or coordinates like { "from": "g1", "to": "f3" }.',
  'When the user says a natural move such as "pawn to e4" or "knight f3", convert it to SAN when possible before calling move.',
  'When the user directly tells you to make a move for them, such as "play my knight to c3", "move white knight to c3", "play Nc3", or "take on e5", call move immediately if the move is legal. A direct move instruction is always permission for one move, even when ongoing auto-reply mode is off.',
  'Do not treat advisory or evaluative chess questions as permission to move. Questions such as "can I take that?", "should we capture?", "is Nxe5 legal?", "what can take on e5?", or "what is the best move?" require analysis first, not move.',
  "If the user asks whether a capture is available, legal, or good, use show_hint, get_board_state, get_best_move, or a very short send_message reply as needed. Only call move when the user explicitly tells you to play or take that move.",
  "Use show_hint when the user asks what can move from a square, asks for legal moves, or asks for a hint from a square.",
  "Use get_board_state when the user asks about the current position, asks whose turn it is, asks what changed, or when you need fresh state before a follow-up tool call.",
  "Use get_best_move when the user asks for the best move, next move, strongest move, engine move, or a recommendation from the current position.",
  "After get_best_move, call move with the returned coordinates only if the user asked you to actually play that move.",
  "The app may send you system messages with the latest board state after moves, undo, and reset operations. Treat those updates as fresh context about the visible position.",
  "Some system messages describe moves or board changes that happened outside of a tool call. Treat those as real visible app events, not as background narration.",
  "Only take a follow-up move on your own when the user explicitly opted into an ongoing auto-reply mode, for example by saying 'move every time I move', 'keep replying after each of my moves', or 'just keep playing back automatically'.",
  "Do not infer ongoing auto-reply mode from a single move request, from being asked to play one side once, or from a general request to play chess.",
  "When a system update says a manual board move happened outside of a tool call and ongoing auto-reply mode is active and it is now your side to move, treat that update as a turn handoff and you may immediately choose and play exactly one follow-up move without waiting for another user message.",
  "For that manual board-move handoff, prefer get_best_move before move whenever you need a default or strongest reply, then play exactly one move.",
  "Do not take an automatic follow-up move after reset, undo, control-button actions, tool-driven moves, or unrelated board-state updates unless the user explicitly asked you to continue from that new position.",
  "Stay tightly scoped to the user's latest chess request. Do not keep analyzing or playing after the request has been satisfied.",
  "Use at most the minimum tool chain needed for one request.",
  "Never make more than one move unless the user explicitly asked for multiple moves, a line, or a sequence.",
  "Use undo_move only when the user explicitly asks to undo or take back a move.",
  "Use reset_board only when the user explicitly asks to reset, restart, or start a new game.",
  'Use change_demo with { "demo": "theme" } when the user asks for the theme example, light mode, dark mode, or theme switching.',
  'Use change_demo with { "demo": "form" } when the user asks for the form demo, PT intake form, or form filling.',
  "Keep any text reply extremely short and action-focused.",
  "Wake-word activation is handled by the demo itself."
].join(" ");

export function buildChessBoardStateMessage(boardState: ChessBoardStateResult) {
  const lastMove =
    boardState.lastMove.from && boardState.lastMove.to
      ? `${boardState.lastMove.from} to ${boardState.lastMove.to}`
      : "none";
  const focusedSquare = boardState.selectedSquare ?? boardState.hint.origin ?? "none";

  return [
    "Board state update: the visible chessboard has this current state.",
    `Turn=${boardState.turn === "w" ? "white" : "black"}.`,
    `Status=${boardState.status}.`,
    `Move count=${boardState.history.length}.`,
    `Last move=${lastMove}.`,
    `Focused square=${focusedSquare}.`,
    `Current FEN=${boardState.fen}.`
  ].join(" ");
}

export function buildChessContextMessage(event: ChessContextEvent) {
  const sideToMove = event.turn === "w" ? "White" : "Black";

  if (event.type === "move") {
    const sourceSentence =
      event.source === "tool"
        ? "This board state came from a tool-driven action."
        : "This board state came from a manual human move on the board outside of a tool call.";

    return [
      "Board state update: a move was completed on the visible chessboard.",
      sourceSentence,
      `Move played: ${event.move.san} from ${event.move.from} to ${event.move.to}.`,
      `${sideToMove} is now to move.`,
      `Game status: ${event.status}.`,
      `Move count: ${event.historyLength}.`,
      `Current FEN: ${event.fen}.`
    ].join(" ");
  }

  if (event.type === "undo") {
    const sourceSentence =
      event.source === "tool"
        ? "This board state came from a tool-driven action."
        : "This board state came from a manual control action outside of a tool call.";

    return [
      "Board state update: the most recent move was undone.",
      sourceSentence,
      `Undone move: ${event.undone.san} from ${event.undone.from} to ${event.undone.to}.`,
      `${sideToMove} is now to move.`,
      `Game status: ${event.status}.`,
      `Move count: ${event.historyLength}.`,
      `Current FEN: ${event.fen}.`
    ].join(" ");
  }

  const sourceSentence =
    event.source === "tool"
      ? "This board state came from a tool-driven action."
      : "This board state came from a manual control action outside of a tool call.";

  return [
    "Board state update: the chess game was reset to the starting position.",
    sourceSentence,
    `${sideToMove} is now to move.`,
    `Game status: ${event.status}.`,
    "Move count: 0.",
    `Current FEN: ${event.fen}.`
  ].join(" ");
}
