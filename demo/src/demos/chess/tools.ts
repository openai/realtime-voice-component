import { defineVoiceTool, type UseGhostCursorReturn } from "realtime-voice-component";
import { z } from "zod";

import type {
  ChessBoardStateResult,
  ChessHintResult,
  ChessMoveArgs,
  ChessMovePreview,
  ChessMoveResult,
  ChessResetResult,
  ChessUndoResult
} from "./state";
import type { ChessEngineRecommendation } from "./engine";

type CreateMoveToolOptions = {
  applyMove: (args: ChessMoveArgs) => ChessMoveResult;
  getBoardElement: () => HTMLElement | null;
  previewMove: (args: ChessMoveArgs) => ChessMovePreview | null;
  runCursor: UseGhostCursorReturn["run"];
  runCursorEach: UseGhostCursorReturn["runEach"];
};

type CreateShowHintToolOptions = {
  getSquareElement: (square: string) => HTMLElement | null;
  runCursor: UseGhostCursorReturn["run"];
  showHint: (square: string) => ChessHintResult;
};

type CreateControlToolOptions = {
  getButton: () => HTMLButtonElement | null;
  runCursor: UseGhostCursorReturn["run"];
};

const MOVE_PARAMETERS_SCHEMA = z
  .object({
    san: z.string().trim().min(1).optional().describe("A chess move in SAN, such as e4 or Nf3."),
    from: z.string().trim().optional().describe('The source square, such as "e2".'),
    to: z.string().trim().optional().describe('The destination square, such as "e4".'),
    promotion: z
      .enum(["q", "r", "b", "n"])
      .optional()
      .describe('Promotion piece when needed: "q", "r", "b", or "n".')
  })
  .strict()
  .describe('Play one legal move using either "san" or "from" and "to".');

const SHOW_HINT_PARAMETERS_SCHEMA = z
  .object({
    square: z
      .string()
      .trim()
      .min(2)
      .max(2)
      .describe('An algebraic square such as "g1" or "e2".')
  })
  .strict()
  .describe("Highlight legal moves from the requested square without moving anything.");

const EMPTY_PARAMETERS_SCHEMA = z.object({}).strict();

function getSquareTarget(square: string, getSquareElement: (square: string) => HTMLElement | null) {
  const element = getSquareElement(square);

  if (!element) {
    return null;
  }

  return {
    element,
    pulseElement: element
  };
}

async function runOnElement<T>(
  runCursor: UseGhostCursorReturn["run"],
  element: HTMLElement | null,
  callback: () => T | Promise<T>
) {
  if (!element) {
    return callback();
  }

  return runCursor(
    {
      element,
      pulseElement: element
    },
    callback,
    {
      easing: "smooth",
      from: "previous"
    }
  );
}

export function createMoveTool({
  applyMove,
  getBoardElement,
  previewMove,
  runCursor,
  runCursorEach
}: CreateMoveToolOptions) {
  return defineVoiceTool({
    name: "move",
    description:
      'Play exactly one legal chess move using either SAN like "Nf3" or coordinates like from "g1" to "f3".',
    parameters: MOVE_PARAMETERS_SCHEMA,
    async execute(args: ChessMoveArgs) {
      const boardElement = getBoardElement();
      const preview = previewMove(args);
      const previewPayload =
        preview === null
          ? null
          : {
              from: preview.from,
              to: preview.to
            };

      if (preview) {
        const squares = [preview.from, preview.to];

        const result = await runCursorEach(
          squares,
          (square) => {
            const element =
              boardElement?.querySelector<HTMLElement>(`[data-square="${square}"]`) ?? null;

            return element
              ? {
                  element,
                  pulseElement: element
                }
              : {
                  element: boardElement,
                  pulseElement: boardElement
                };
          },
          (_square, index) => {
            if (index < squares.length - 1) {
              return null;
            }

            return applyMove(args);
          },
          {
            easing: "smooth",
            from: "previous"
          }
        );

        const finalResult = result.at(-1);

        return {
          ...(finalResult as ChessMoveResult | null),
          preview: previewPayload
        };
      }

      return runOnElement(runCursor, boardElement, () => {
        const result = applyMove(args);

        return {
          ...result,
          preview: previewPayload
        };
      });
    }
  });
}

export function createShowHintTool({
  getSquareElement,
  runCursor,
  showHint
}: CreateShowHintToolOptions) {
  return defineVoiceTool({
    name: "show_hint",
    description:
      "Highlight legal moves from a square without changing the position. Use this for hints and legal-move questions.",
    parameters: SHOW_HINT_PARAMETERS_SCHEMA,
    execute({ square }: { square: string }) {
      const target = getSquareTarget(square, getSquareElement);

      if (!target) {
        return showHint(square);
      }

      return runCursor(target, () => showHint(square), {
        easing: "smooth",
        from: "previous"
      });
    }
  });
}

export function createGetBoardStateTool(getBoardState: () => ChessBoardStateResult) {
  return defineVoiceTool({
    name: "get_board_state",
    description:
      "Inspect the current chess position without changing it. Use this before answering board-state questions or planning a follow-up move.",
    parameters: EMPTY_PARAMETERS_SCHEMA.describe("Return the current board state summary."),
    execute: () => getBoardState()
  });
}

export function createGetBestMoveTool(getBestMove: () => ChessEngineRecommendation) {
  return defineVoiceTool({
    name: "get_best_move",
    description:
      "Ask the demo chess engine for the strongest next move in the current position without changing the board.",
    parameters: EMPTY_PARAMETERS_SCHEMA.describe(
      "Return the best move recommendation for the current position."
    ),
    execute: () => getBestMove()
  });
}

export function createUndoMoveTool({
  getButton,
  runCursor,
  undoMove
}: CreateControlToolOptions & {
  undoMove: () => ChessUndoResult;
}) {
  return defineVoiceTool({
    name: "undo_move",
    description: "Undo the most recent move if one exists. Use only for explicit undo requests.",
    parameters: EMPTY_PARAMETERS_SCHEMA.describe("Undo the most recent move."),
    execute: () => runOnElement(runCursor, getButton(), () => undoMove())
  });
}

export function createResetBoardTool({
  getButton,
  resetBoard,
  runCursor
}: CreateControlToolOptions & {
  resetBoard: () => ChessResetResult;
}) {
  return defineVoiceTool({
    name: "reset_board",
    description:
      "Reset the game to the standard starting position. Use only for reset, restart, or new-game requests.",
    parameters: EMPTY_PARAMETERS_SCHEMA.describe("Reset the board to the starting position."),
    execute: () => runOnElement(runCursor, getButton(), () => resetBoard())
  });
}
