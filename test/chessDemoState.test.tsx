import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useChessDemoState } from "../demo/src/demos/chess/state";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("useChessDemoState", () => {
  it("returns a structured board snapshot for the starting position", () => {
    const { result } = renderHook(() => useChessDemoState());

    expect(result.current.getBoardState()).toEqual({
      ok: true,
      fen: STARTING_FEN,
      turn: "w",
      status: "in_progress",
      history: [],
      lastMove: {
        from: null,
        to: null
      },
      hint: {
        origin: null,
        destinations: []
      },
      selectedSquare: null,
      legalMovesFromFocusSquare: []
    });
  });

  it("tracks hints and board state changes across move, undo, and reset", () => {
    const { result } = renderHook(() => useChessDemoState());

    act(() => {
      const hint = result.current.showHint("g1");
      expect(hint).toMatchObject({
        ok: true,
        square: "g1"
      });
    });

    expect(result.current.getBoardState()).toMatchObject({
      hint: {
        origin: "g1",
        destinations: ["f3", "h3"]
      },
      selectedSquare: "g1",
      legalMovesFromFocusSquare: [
        expect.objectContaining({ from: "g1", to: "f3", san: "Nf3" }),
        expect.objectContaining({ from: "g1", to: "h3", san: "Nh3" })
      ]
    });

    act(() => {
      expect(result.current.applyMove({ san: "Nf3" })).toMatchObject({
        ok: true,
        san: "Nf3",
        turn: "b"
      });
    });

    expect(result.current.latestContextEvent).toMatchObject({
      type: "move",
      move: {
        san: "Nf3",
        from: "g1",
        to: "f3"
      },
      turn: "b",
      status: "in_progress"
    });
    expect(result.current.getBoardState()).toMatchObject({
      turn: "b",
      history: [{ san: "Nf3", from: "g1", to: "f3" }],
      lastMove: {
        from: "g1",
        to: "f3"
      },
      hint: {
        origin: null,
        destinations: []
      },
      selectedSquare: null,
      legalMovesFromFocusSquare: []
    });

    act(() => {
      expect(result.current.undoMove()).toMatchObject({
        ok: true,
        fen: STARTING_FEN
      });
    });

    expect(result.current.latestContextEvent).toMatchObject({
      type: "undo",
      undone: {
        san: "Nf3",
        from: "g1",
        to: "f3"
      },
      fen: STARTING_FEN,
      turn: "w"
    });

    act(() => {
      expect(result.current.resetBoard()).toMatchObject({
        ok: true,
        fen: STARTING_FEN
      });
    });

    expect(result.current.latestContextEvent).toMatchObject({
      type: "reset",
      fen: STARTING_FEN,
      turn: "w",
      historyLength: 0
    });
    expect(result.current.getBoardState().fen).toBe(STARTING_FEN);
  });

  it("rejects illegal moves and returns a legal engine move without mutating the board", () => {
    const { result } = renderHook(() => useChessDemoState());

    act(() => {
      expect(result.current.applyMove({ from: "e2", to: "e5" })).toEqual({
        ok: false,
        message: "Illegal move for current position.",
        fen: STARTING_FEN
      });
    });

    const beforeFen = result.current.state.fen;
    const recommendation = result.current.getBestMove();

    expect(recommendation).toMatchObject({
      ok: true
    });

    if (!recommendation.ok) {
      throw new Error("Expected a best-move recommendation for the starting position.");
    }

    expect(result.current.previewMove({ from: recommendation.from, to: recommendation.to })).not.toBeNull();
    expect(result.current.state.fen).toBe(beforeFen);
  });

  it("updates shared state and context when a move is made directly on the board", () => {
    const { result } = renderHook(() => useChessDemoState());

    act(() => {
      expect(result.current.attemptBoardMove("e2", "e4", "wP")).toBe(true);
    });

    expect(result.current.latestContextEvent).toMatchObject({
      type: "move",
      move: {
        san: "e4",
        from: "e2",
        to: "e4"
      },
      turn: "b"
    });
    expect(result.current.getBoardState()).toMatchObject({
      history: [{ san: "e4", from: "e2", to: "e4" }],
      lastMove: {
        from: "e2",
        to: "e4"
      }
    });
  });
});
