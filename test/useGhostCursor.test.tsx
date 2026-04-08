
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GhostCursorOverlay } from "../src/components/GhostCursorOverlay";
import { useGhostCursor } from "../src/useGhostCursor";
import type {
  GhostCursorState,
  UseGhostCursorOptions,
  UseGhostCursorReturn
} from "../src/types";

let latestCursor: UseGhostCursorReturn | null = null;

function HookHarness({ options }: { options?: UseGhostCursorOptions } = {}) {
  const cursor = useGhostCursor(options);
  latestCursor = cursor;

  return (
    <>
      <GhostCursorOverlay state={cursor.cursorState} />
      <div data-testid="phase">{cursor.cursorState.main.phase}</div>
      <div data-testid="x">{String(cursor.cursorState.main.position.x)}</div>
      <div data-testid="y">{String(cursor.cursorState.main.position.y)}</div>
    </>
  );
}

function getCursor() {
  if (!latestCursor) {
    throw new Error("Expected ghost cursor harness to be mounted.");
  }

  return latestCursor;
}

function setRect(
  element: HTMLElement,
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }
) {
  const fullRect = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    }
  };

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => fullRect
  });
  Object.defineProperty(element, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
}

describe("useGhostCursor", () => {
  beforeEach(() => {
    latestCursor = null;
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        }
      }))
    });
  });

  afterEach(() => {
    latestCursor = null;
    vi.useRealTimers();
  });

  it("moves to an explicit point", async () => {
    render(<HookHarness />);

    await act(async () => {
      const movement = getCursor().run({ point: { x: 120, y: 220 } }, () => undefined);
      await vi.advanceTimersByTimeAsync(1200);
      await movement;
    });

    const cursorElement = document.querySelector(".vc-ghost-cursor");
    if (!cursorElement) {
      throw new Error("Expected visible ghost cursor.");
    }

    expect(screen.getByTestId("phase")).toHaveTextContent("arrived");
    expect(cursorElement).toHaveStyle("--vc-ghost-cursor-x: 120px");
    expect(cursorElement).toHaveStyle("--vc-ghost-cursor-y: 220px");
  });

  it("moves to an element center and hides on scroll", async () => {
    render(
      <>
        <HookHarness />
        <button data-testid="target" type="button">
          target
        </button>
      </>
    );

    const target = screen.getByTestId("target");
    setRect(target, {
      left: 40,
      top: 50,
      width: 100,
      height: 40
    });

    await act(async () => {
      const movement = getCursor().run({ element: target }, () => undefined);
      await vi.advanceTimersByTimeAsync(1200);
      await movement;
    });

    let cursorElement = document.querySelector(".vc-ghost-cursor");
    if (!cursorElement) {
      throw new Error("Expected visible ghost cursor.");
    }

    expect(cursorElement).toHaveStyle("--vc-ghost-cursor-x: 90px");
    expect(cursorElement).toHaveStyle("--vc-ghost-cursor-y: 70px");

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    cursorElement = document.querySelector(".vc-ghost-cursor");
    expect(cursorElement).toBeNull();
  });

  it("uses reduced motion without travel animation", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        }
      }))
    });

    render(<HookHarness />);

    await act(async () => {
      const movement = getCursor().run({ point: { x: 300, y: 180 } }, () => undefined);
      await vi.advanceTimersByTimeAsync(600);
      await movement;
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("arrived");
    expect(screen.getByTestId("x")).toHaveTextContent("300");
    expect(screen.getByTestId("y")).toHaveTextContent("180");
  });

  it("surfaces the error phase in reduced-motion mode when the wrapped operation throws", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        }
      }))
    });

    render(<HookHarness />);

    const movement = getCursor()
      .run(
        { point: { x: 180, y: 140 } },
        () => {
          throw new Error("boom");
        }
      )
      .catch((error) => error);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const error = await movement;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");

    expect(screen.getByTestId("phase")).toHaveTextContent("error");
    expect(screen.getByTestId("x")).toHaveTextContent("180");
    expect(screen.getByTestId("y")).toHaveTextContent("140");
  });

  it("can continue from the previous scripted position", async () => {
    render(<HookHarness />);

    await act(async () => {
      const firstMovement = getCursor().run({ point: { x: 120, y: 220 } }, () => undefined);
      await vi.advanceTimersByTimeAsync(1200);
      await firstMovement;
    });

    let secondMovement: Promise<void> | undefined;
    await act(async () => {
      secondMovement = getCursor().run(
        { point: { x: 220, y: 260 } },
        () => undefined,
        { from: "previous" }
      );
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("traveling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await secondMovement;
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("arrived");
    expect(screen.getByTestId("x")).toHaveTextContent("220");
    expect(screen.getByTestId("y")).toHaveTextContent("260");
  });

  it("surfaces the error phase when the wrapped operation throws", async () => {
    render(<HookHarness />);

    const movement = getCursor()
      .run(
        { point: { x: 200, y: 160 } },
        () => {
          throw new Error("boom");
        }
      )
      .catch((error) => error);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    const error = await movement;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");

    expect(screen.getByTestId("phase")).toHaveTextContent("error");
  });

  it("runs batched cursor steps, scrolls off-screen targets into view, and hides afterward", async () => {
    render(
      <>
        <HookHarness />
        <button data-testid="target-a" type="button">
          first
        </button>
        <button data-testid="target-b" type="button">
          second
        </button>
      </>
    );

    const targetA = screen.getByTestId("target-a");
    const targetB = screen.getByTestId("target-b");
    setRect(targetA, {
      left: 12,
      top: 18,
      width: 100,
      height: 40
    });
    setRect(targetB, {
      left: 420,
      top: 240,
      width: 120,
      height: 48
    });

    const operation = vi.fn((label: string) => `${label}:done`);
    let results: string[] | undefined;

    await act(async () => {
      const movement = getCursor().runEach(
        ["a", "b"],
        (label) => ({ element: label === "a" ? targetA : targetB }),
        operation
      );
      await vi.advanceTimersByTimeAsync(2400);
      results = await movement;
    });

    expect(results).toEqual(["a:done", "b:done"]);
    expect(operation).toHaveBeenCalledTimes(2);
    expect((targetA.scrollIntoView as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".vc-ghost-cursor")).toBeNull();
  });

  it("hides the cursor immediately when hide is called", async () => {
    render(<HookHarness />);

    await act(async () => {
      const movement = getCursor().run({ point: { x: 120, y: 220 } }, () => undefined);
      await vi.advanceTimersByTimeAsync(1200);
      await movement;
    });

    expect(document.querySelector(".vc-ghost-cursor")).not.toBeNull();

    act(() => {
      getCursor().hide();
    });

    expect(document.querySelector(".vc-ghost-cursor")).toBeNull();
    expect(screen.getByTestId("phase")).toHaveTextContent("hidden");
  });
});

describe("GhostCursorOverlay", () => {
  it("renders only visible sprites", () => {
    const state: GhostCursorState = {
      main: {
        id: "main",
        role: "main",
        phase: "hidden",
        position: { x: 0, y: 0 },
        durationMs: 0
      },
      satellites: [
        {
          id: "sat-1",
          role: "satellite",
          phase: "arrived",
          position: { x: 12, y: 18 },
          durationMs: 80
        }
      ]
    };

    render(<GhostCursorOverlay state={state} />);

    expect(document.querySelectorAll(".vc-ghost-cursor")).toHaveLength(1);
    expect(document.querySelector('.vc-ghost-cursor[data-role="main"]')).toBeNull();
    expect(document.querySelector('.vc-ghost-cursor[data-role="satellite"]')).not.toBeNull();
  });
});
