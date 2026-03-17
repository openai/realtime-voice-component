import { useCallback, useEffect, useRef, useState } from "react";

import type {
  GhostCursorEasing,
  GhostCursorMotionOptions,
  GhostCursorOrigin,
  GhostCursorPhase,
  GhostCursorPoint,
  GhostCursorState,
  GhostCursorTarget,
  UseGhostCursorOptions,
  UseGhostCursorReturn
} from "./types";

const GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME = "vc-ghost-cursor-target-active";
const DEFAULT_VIEWPORT_PADDING = 72;
const MIN_TRAVEL_MS = 320;
const MAX_TRAVEL_MS = 560;
const ARRIVAL_PULSE_MS = 180;
const DEFAULT_IDLE_HIDE_MS = 5000;
const DEFAULT_SCROLL_SETTLE_MS = 220;
const STEP_HOLD_MS = 260;
const FAST_BATCH_MIN_TRAVEL_MS = 130;
const FAST_BATCH_MAX_TRAVEL_MS = 220;
const FAST_BATCH_PULSE_MS = 80;
const FAST_BATCH_FINAL_HOLD_MS = 200;

type ResolvedCursorStop = {
  element: HTMLElement | null;
  pulseElement: HTMLElement | null;
  point: GhostCursorPoint;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForNextAnimationFrame() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createPoint(x: number, y: number): GhostCursorPoint {
  return { x, y };
}

function normalizeMotionOptions(options?: GhostCursorMotionOptions) {
  return {
    easing: options?.easing ?? "smooth",
    from: options?.from ?? "pointer"
  } satisfies Required<GhostCursorMotionOptions>;
}

function getViewportFallbackPoint(): GhostCursorPoint {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.max(window.innerWidth - 84, 0),
    y: Math.max(window.innerHeight - 84, 0)
  };
}

function getElementPoint(element: HTMLElement): GhostCursorPoint {
  const rect = element.getBoundingClientRect();
  const isTextEntry =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

  if (isTextEntry) {
    return {
      x: rect.left + Math.min(28, rect.width * 0.18),
      y: rect.top + rect.height / 2
    };
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function resolveTargetStop(target: GhostCursorTarget): ResolvedCursorStop | null {
  const element = target.element ?? null;
  const point = target.point ?? (element ? getElementPoint(element) : null);

  if (!point) {
    return null;
  }

  return {
    element,
    pulseElement: target.pulseElement ?? element,
    point
  };
}

function isOutsidePaddedViewport(element: HTMLElement, viewportPadding: number) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return (
    rect.top < viewportPadding ||
    rect.left < viewportPadding ||
    rect.bottom > viewportHeight - viewportPadding ||
    rect.right > viewportWidth - viewportPadding
  );
}

function getTravelDuration(from: GhostCursorPoint, to: GhostCursorPoint) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return clamp(MIN_TRAVEL_MS + distance * 0.18, MIN_TRAVEL_MS, MAX_TRAVEL_MS);
}

function getFastBatchTravelDuration(from: GhostCursorPoint, to: GhostCursorPoint) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return clamp(
    FAST_BATCH_MIN_TRAVEL_MS + distance * 0.12,
    FAST_BATCH_MIN_TRAVEL_MS,
    FAST_BATCH_MAX_TRAVEL_MS
  );
}

function getBatchScrollTarget(elements: HTMLElement[]) {
  if (elements.length === 0) {
    return null;
  }

  const centers = elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      element,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  const centroid = centers.reduce(
    (point, center) => ({
      x: point.x + center.x / centers.length,
      y: point.y + center.y / centers.length
    }),
    { x: 0, y: 0 }
  );

  return centers.reduce((closest, candidate) => {
    if (!closest) {
      return candidate;
    }

    const closestDistance = Math.hypot(closest.x - centroid.x, closest.y - centroid.y);
    const candidateDistance = Math.hypot(candidate.x - centroid.x, candidate.y - centroid.y);

    return candidateDistance < closestDistance ? candidate : closest;
  }, centers[0]!).element;
}

export function useGhostCursor({
  idleHideMs = DEFAULT_IDLE_HIDE_MS,
  scrollSettleMs = DEFAULT_SCROLL_SETTLE_MS,
  viewportPadding = DEFAULT_VIEWPORT_PADDING
}: UseGhostCursorOptions = {}): UseGhostCursorReturn {
  const [cursorState, setCursorState] = useState<GhostCursorState>(() => ({
    main: {
      id: "main",
      role: "main",
      phase: "hidden",
      position: getViewportFallbackPoint(),
      durationMs: 0,
      easing: "smooth"
    },
    satellites: []
  }));

  const trackedPointerRef = useRef<GhostCursorPoint | null>(null);
  const scriptedPointerRef = useRef<GhostCursorPoint | null>(null);
  const queueRef = useRef(Promise.resolve());
  const activeTargetsRef = useRef<HTMLElement[]>([]);
  const hideTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearActiveTargets = useCallback(() => {
    if (activeTargetsRef.current.length === 0) {
      return;
    }

    for (const element of activeTargetsRef.current) {
      element.classList.remove(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
    }

    activeTargetsRef.current = [];
  }, []);

  const hideAllCursors = useCallback(() => {
    setCursorState((current) => ({
      main: {
        ...current.main,
        phase: "hidden",
        durationMs: ARRIVAL_PULSE_MS
      },
      satellites: []
    }));
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideAllCursors();
    }, idleHideMs);
  }, [clearHideTimer, hideAllCursors, idleHideMs]);

  const dismissCursors = useCallback(() => {
    clearHideTimer();
    clearActiveTargets();
    hideAllCursors();
  }, [clearActiveTargets, clearHideTimer, hideAllCursors]);

  const pulseTargets = useCallback(
    async (elements: Array<HTMLElement | null | undefined>, durationMs = ARRIVAL_PULSE_MS) => {
      clearActiveTargets();

      const uniqueTargets = [...new Set(elements.filter((element): element is HTMLElement => !!element))];
      if (uniqueTargets.length === 0) {
        return;
      }

      activeTargetsRef.current = uniqueTargets;
      for (const element of uniqueTargets) {
        element.classList.add(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
      }

      await wait(durationMs);

      for (const element of uniqueTargets) {
        element.classList.remove(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
      }

      if (activeTargetsRef.current === uniqueTargets) {
        activeTargetsRef.current = [];
      }
    },
    [clearActiveTargets]
  );

  const resolveOrigin = useCallback((from: GhostCursorOrigin = "pointer") => {
    if (typeof from === "object") {
      return from;
    }

    if (from === "previous" && scriptedPointerRef.current) {
      return scriptedPointerRef.current;
    }

    if (trackedPointerRef.current) {
      return trackedPointerRef.current;
    }

    return getViewportFallbackPoint();
  }, []);

  const updateMainCursor = useCallback(
    (
      phase: GhostCursorPhase,
      position: GhostCursorPoint,
      durationMs: number,
      easing: GhostCursorEasing = "smooth"
    ) => {
      scriptedPointerRef.current = position;
      setCursorState((current) => ({
        main: {
          ...current.main,
          easing,
          phase,
          position,
          durationMs
        },
        satellites: []
      }));
    },
    []
  );

  const animateMainCursorTravel = useCallback(
    async (
      origin: GhostCursorPoint,
      target: GhostCursorPoint,
      durationMs: number,
      easing: GhostCursorEasing
    ) => {
      updateMainCursor("traveling", origin, 0, easing);

      if (durationMs <= 0) {
        updateMainCursor("traveling", target, 0, easing);
        return;
      }

      await waitForNextAnimationFrame();
      updateMainCursor("traveling", target, durationMs, easing);
      await wait(durationMs);
    },
    [updateMainCursor]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };

    const handlePointerMove = (event: PointerEvent) => {
      trackedPointerRef.current = createPoint(event.clientX, event.clientY);
    };
    const handleWindowBlur = () => {
      trackedPointerRef.current = null;
    };

    syncReducedMotion();
    mediaQuery.addEventListener("change", syncReducedMotion);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      mediaQuery.removeEventListener("change", syncReducedMotion);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const passiveListener: AddEventListenerOptions = { passive: true };
    const captureListener: AddEventListenerOptions = { capture: true, passive: true };

    window.addEventListener("wheel", dismissCursors, passiveListener);
    window.addEventListener("touchmove", dismissCursors, passiveListener);
    window.addEventListener("scroll", dismissCursors, passiveListener);
    document.addEventListener("scroll", dismissCursors, captureListener);

    return () => {
      window.removeEventListener("wheel", dismissCursors, passiveListener);
      window.removeEventListener("touchmove", dismissCursors, passiveListener);
      window.removeEventListener("scroll", dismissCursors, passiveListener);
      document.removeEventListener("scroll", dismissCursors, captureListener);
    };
  }, [dismissCursors]);

  useEffect(
    () => () => {
      clearHideTimer();
      clearActiveTargets();
    },
    [clearActiveTargets, clearHideTimer]
  );

  const runSingle = useCallback(
    async <TResult>(
      target: GhostCursorTarget,
      operation: () => Promise<TResult> | TResult,
      options?: GhostCursorMotionOptions
    ) => {
      clearHideTimer();
      clearActiveTargets();
      const motion = normalizeMotionOptions(options);

      const stop = resolveTargetStop(target);
      if (!stop) {
        return operation();
      }

      const targetElement = stop.element;
      const pulseElement = stop.pulseElement;
      const targetPoint = stop.point;

      if (reducedMotionRef.current) {
        try {
          const result = await operation();
          updateMainCursor("arrived", targetPoint, ARRIVAL_PULSE_MS);
          await pulseTargets([pulseElement]);
          await wait(STEP_HOLD_MS);
          scheduleHide();
          return result;
        } catch (error) {
          updateMainCursor("error", targetPoint, ARRIVAL_PULSE_MS);
          scheduleHide();
          await wait(ARRIVAL_PULSE_MS);
          throw error;
        }
      }

      if (targetElement && isOutsidePaddedViewport(targetElement, viewportPadding)) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center"
        });
        await wait(scrollSettleMs);
      }

      const resolvedStop = resolveTargetStop(target) ?? stop;
      const origin = resolveOrigin(motion.from);
      const durationMs = getTravelDuration(origin, resolvedStop.point);
      await animateMainCursorTravel(origin, resolvedStop.point, durationMs, motion.easing);

      try {
        const result = await operation();
        updateMainCursor("arrived", resolvedStop.point, ARRIVAL_PULSE_MS);
        await pulseTargets([resolvedStop.pulseElement]);
        await wait(STEP_HOLD_MS);
        scheduleHide();
        return result;
      } catch (error) {
        updateMainCursor("error", resolvedStop.point, ARRIVAL_PULSE_MS);
        scheduleHide();
        await wait(ARRIVAL_PULSE_MS);
        throw error;
      }
    },
    [
      animateMainCursorTravel,
      clearActiveTargets,
      clearHideTimer,
      pulseTargets,
      resolveOrigin,
      scheduleHide,
      scrollSettleMs,
      updateMainCursor,
      viewportPadding
    ]
  );

  const runEachInternal = useCallback(
    async <TItem, TResult>(
      items: TItem[],
      resolveTarget: (item: TItem, index: number) => GhostCursorTarget | null | undefined,
      operation: (item: TItem, index: number) => Promise<TResult> | TResult,
      options?: GhostCursorMotionOptions
    ) => {
      clearHideTimer();
      clearActiveTargets();
      const motion = normalizeMotionOptions(options);

      let resolvedTargets = items.map((item, index) => resolveTargetStop(resolveTarget(item, index) ?? {}));
      const resolvedElements = resolvedTargets.flatMap((target) =>
        target?.element ? [target.element] : []
      );

      if (
        !reducedMotionRef.current &&
        resolvedElements.some((element) => isOutsidePaddedViewport(element, viewportPadding))
      ) {
        getBatchScrollTarget(resolvedElements)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center"
        });
        await wait(scrollSettleMs);
        resolvedTargets = items.map((item, index) => resolveTargetStop(resolveTarget(item, index) ?? {}));
      }

      const results: TResult[] = [];
      let currentPoint = resolveOrigin(motion.from);
      let hasResolvedTarget = false;

      for (const [index, item] of items.entries()) {
        const target = resolvedTargets[index];

        if (!target) {
          results.push(await operation(item, index));
          continue;
        }

        hasResolvedTarget = true;

        if (reducedMotionRef.current) {
          updateMainCursor("arrived", target.point, FAST_BATCH_PULSE_MS);
        } else {
          const durationMs = getFastBatchTravelDuration(currentPoint, target.point);
          await animateMainCursorTravel(currentPoint, target.point, durationMs, motion.easing);
          updateMainCursor("arrived", target.point, FAST_BATCH_PULSE_MS);
        }

        currentPoint = target.point;

        try {
          results.push(await operation(item, index));
        } catch (error) {
          updateMainCursor("error", target.point, ARRIVAL_PULSE_MS);
          await wait(ARRIVAL_PULSE_MS);
          throw error;
        }

        await pulseTargets([target.pulseElement], FAST_BATCH_PULSE_MS);
      }

      if (!hasResolvedTarget) {
        hideAllCursors();
        return results;
      }

      await wait(FAST_BATCH_FINAL_HOLD_MS);
      hideAllCursors();
      return results;
    },
    [
      animateMainCursorTravel,
      clearActiveTargets,
      clearHideTimer,
      hideAllCursors,
      pulseTargets,
      resolveOrigin,
      scrollSettleMs,
      updateMainCursor,
      viewportPadding
    ]
  );

  const enqueueRun = useCallback(<TResult,>(run: () => Promise<TResult> | TResult) => {
    const queuedRun = queueRef.current.then(run, run);
    queueRef.current = queuedRun.then(
      () => undefined,
      () => undefined
    );

    return queuedRun;
  }, []);

  const run = useCallback(
    async <TResult,>(
      target: GhostCursorTarget,
      operation: () => Promise<TResult> | TResult,
      options?: GhostCursorMotionOptions
    ) => enqueueRun(() => runSingle(target, operation, options)),
    [enqueueRun, runSingle]
  );

  const runEach = useCallback(
    async <TItem, TResult,>(
      items: TItem[],
      resolveTarget: (item: TItem, index: number) => GhostCursorTarget | null | undefined,
      operation: (item: TItem, index: number) => Promise<TResult> | TResult,
      options?: GhostCursorMotionOptions
    ) => enqueueRun(() => runEachInternal(items, resolveTarget, operation, options)),
    [enqueueRun, runEachInternal]
  );

  const hide = useCallback(() => {
    dismissCursors();
  }, [dismissCursors]);

  return {
    cursorState,
    hide,
    run,
    runEach
  };
}
