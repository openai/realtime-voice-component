import { ai } from "js-chess-engine";
import { Chess, type Square } from "chess.js";

export type ChessEngineRecommendation =
  | {
      ok: true;
      fen: string;
      from: string;
      to: string;
      san: string;
      promotion: "q" | null;
      scoreCp: number | null;
      depth: number | null;
      nodesSearched: number | null;
    }
  | {
      ok: false;
      fen: string;
      message: string;
    };

function inferPromotion(fen: string, from: string, to: string) {
  const preview = new Chess(fen);
  const piece = preview.get(from as Square);

  if (!piece || piece.type !== "p") {
    return null;
  }

  return to.endsWith("1") || to.endsWith("8") ? "q" : null;
}

export function getBestMoveForFen(fen: string): ChessEngineRecommendation {
  const preview = new Chess(fen);

  if (preview.isGameOver()) {
    return {
      ok: false,
      fen,
      message: "No best move is available because the game is already over."
    };
  }

  const result = ai(fen, {
    analysis: true,
    level: 3,
    play: false
  });
  const [rawFrom, rawTo] = Object.entries(result.move)[0] ?? [];

  if (!rawFrom || !rawTo) {
    return {
      ok: false,
      fen,
      message: "The chess engine did not return a legal move."
    };
  }

  const from = rawFrom.toLowerCase();
  const to = rawTo.toLowerCase();
  const promotion = inferPromotion(fen, from, to);
  const move = preview.move({
    from,
    to,
    ...(promotion ? { promotion } : {})
  });

  if (!move) {
    return {
      ok: false,
      fen,
      message: "The recommended move could not be translated into the current board state."
    };
  }

  return {
    ok: true,
    fen,
    from,
    to,
    san: move.san,
    promotion,
    scoreCp: result.bestScore ?? null,
    depth: result.depth ?? null,
    nodesSearched: result.nodesSearched ?? null
  };
}
