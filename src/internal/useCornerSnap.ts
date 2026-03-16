import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import {
  clampPositionToViewport,
  createCornerSnapAnimation,
  decayRestPos,
  getCornerPositions,
  getViewportSize,
  nearestCorner,
  stepCornerSnapAnimation,
  type CornerSnapAnimation,
  type CornerSnapCorner,
  type CornerSnapPoint,
  type CornerSnapSize
} from "./cornerSnap";
import {
  readVersionedLocalStorageValue,
  removeLocalStorageValues,
  writeLocalStorageValue
} from "./storage";

const STORAGE_VERSION = "v1";
const STORAGE_PREFIX = `voice-control-corner:${STORAGE_VERSION}:`;
const LEGACY_STORAGE_PREFIX = "voice-control-corner:";
const DRAG_THRESHOLD_PX = 6;
const MAX_POINTER_SAMPLES = 20;
const VELOCITY_LOOKBACK_MS = 100;

type DragHandleKind = "header" | "launcher";

type DragSample = CornerSnapPoint & {
  time: number;
};

type DragSession = {
  handleElement: HTMLElement;
  dragActivated: boolean;
  handleKind: DragHandleKind;
  offset: CornerSnapPoint;
  pointerId: number;
  startPointer: CornerSnapPoint;
};

type UseCornerSnapOptions = {
  defaultCorner: CornerSnapCorner;
  draggable: boolean;
  enabled: boolean;
  fallbackSize: CornerSnapSize;
  inset: number;
  measurementKey?: boolean | number | string;
  persistPosition: boolean;
  widgetId: string;
};

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function getStorageKey(widgetId: string) {
  return `${STORAGE_PREFIX}${widgetId}`;
}

function getLegacyStorageKey(widgetId: string) {
  return `${LEGACY_STORAGE_PREFIX}${widgetId}`;
}

function readStoredCorner(widgetId: string, fallbackCorner: CornerSnapCorner): CornerSnapCorner {
  return readVersionedLocalStorageValue({
    currentKey: getStorageKey(widgetId),
    fallback: fallbackCorner,
    legacyKeys: [getLegacyStorageKey(widgetId)],
    parse: (raw) => {
      const parsed = JSON.parse(raw) as { corner?: CornerSnapCorner };
      if (
        parsed.corner === "top-left" ||
        parsed.corner === "top-right" ||
        parsed.corner === "bottom-left" ||
        parsed.corner === "bottom-right"
      ) {
        return parsed.corner;
      }

      return null;
    }
  });
}

function writeStoredCorner(widgetId: string, corner: CornerSnapCorner) {
  writeLocalStorageValue(getStorageKey(widgetId), JSON.stringify({ corner }));
}

function clearStoredCorner(widgetId: string) {
  removeLocalStorageValues([getStorageKey(widgetId), getLegacyStorageKey(widgetId)]);
}

function readMeasuredRect(node: HTMLElement | null) {
  if (!node) {
    return null;
  }

  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return rect;
}

function readWidgetSize(node: HTMLElement | null, fallbackSize: CornerSnapSize): CornerSnapSize {
  const rect = readMeasuredRect(node);
  if (!rect) {
    return fallbackSize;
  }

  return {
    width: rect.width,
    height: rect.height
  };
}

function readWidgetPosition(
  node: HTMLElement | null,
  fallbackPosition: CornerSnapPoint
): CornerSnapPoint {
  const rect = readMeasuredRect(node);
  if (!rect) {
    return fallbackPosition;
  }

  return {
    x: rect.left,
    y: rect.top
  };
}

function isDragBlocked(target: EventTarget | null, currentTarget: EventTarget | null) {
  const element = target as Element | null;
  const interactiveAncestor = element?.closest?.(
    "button,[role='button'],input,select,textarea,[contenteditable='true'],[data-vc-no-drag]"
  );

  return interactiveAncestor !== null && interactiveAncestor !== currentTarget;
}

function estimateVelocity(samples: DragSample[], now: number): CornerSnapPoint {
  if (samples.length < 2) {
    return { x: 0, y: 0 };
  }

  let index = samples.length - 1;
  while (index > 0) {
    const previous = samples[index - 1];
    if (!previous || now - previous.time > VELOCITY_LOOKBACK_MS) {
      break;
    }

    index -= 1;
  }

  const first = samples[index];
  const last = samples[samples.length - 1];
  if (!first || !last) {
    return { x: 0, y: 0 };
  }

  const dt = now - first.time;
  if (dt <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: ((last.x - first.x) / dt) * 1000,
    y: ((last.y - first.y) / dt) * 1000
  };
}

export function useCornerSnap({
  defaultCorner,
  draggable,
  enabled,
  fallbackSize,
  inset,
  measurementKey,
  persistPosition,
  widgetId
}: UseCornerSnapOptions) {
  const [rootNode, setRootNode] = useState<HTMLElement | null>(null);
  const [corner, setCorner] = useState<CornerSnapCorner>(() =>
    enabled && persistPosition ? readStoredCorner(widgetId, defaultCorner) : defaultCorner
  );
  const [position, setPosition] = useState<CornerSnapPoint>(() => {
    const initialCorner = enabled && persistPosition
      ? readStoredCorner(widgetId, defaultCorner)
      : defaultCorner;
    const corners = getCornerPositions(getViewportSize(), fallbackSize, inset);
    return corners[initialCorner];
  });
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);

  const sizeRef = useRef<CornerSnapSize>(fallbackSize);
  const cornerRef = useRef(corner);
  const positionRef = useRef(position);
  const dragSessionRef = useRef<DragSession | null>(null);
  const pointerHistoryRef = useRef<DragSample[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const animationRef = useRef<CornerSnapAnimation | null>(null);
  const lastWidgetIdRef = useRef(widgetId);
  const suppressLauncherClickRef = useRef(false);
  const rootRef = useCallback((node: HTMLElement | null) => {
    sizeRef.current = readWidgetSize(node, sizeRef.current);
    setRootNode(node);
  }, []);

  const getWidgetSize = useCallback(() => {
    sizeRef.current = readWidgetSize(rootNode, sizeRef.current);
    return sizeRef.current;
  }, [rootNode]);

  const getWidgetPosition = useCallback(() => {
    positionRef.current = readWidgetPosition(rootNode, positionRef.current);
    return positionRef.current;
  }, [rootNode]);

  const setPositionState = useCallback((nextPosition: CornerSnapPoint) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const setClampedPositionState = useCallback((nextPosition: CornerSnapPoint) => {
    const clampedPosition = clampPositionToViewport(
      nextPosition,
      getViewportSize(),
      getWidgetSize(),
      inset
    );
    positionRef.current = clampedPosition;
    setPosition(clampedPosition);
  }, [getWidgetSize, inset]);

  const snapToCorner = useCallback(
    (nextCorner: CornerSnapCorner) => {
      const corners = getCornerPositions(getViewportSize(), getWidgetSize(), inset);
      cornerRef.current = nextCorner;
      setCorner(nextCorner);
      setClampedPositionState(corners[nextCorner]);
    },
    [getWidgetSize, inset, setClampedPositionState]
  );

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    animationRef.current = null;
    setAnimating(false);
  }, []);

  const stepAnimation = useCallback((now: number) => {
    const currentAnimation = animationRef.current;
    if (!currentAnimation) {
      animationFrameRef.current = null;
      setAnimating(false);
      return;
    }

    const result = stepCornerSnapAnimation(currentAnimation, now);
    setClampedPositionState(result.position);

    if (result.animating) {
      animationFrameRef.current = requestAnimationFrame(stepAnimation);
      return;
    }

    animationRef.current = null;
    animationFrameRef.current = null;
    setAnimating(false);
  }, [setClampedPositionState]);

  const ensureAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(stepAnimation);
  }, [stepAnimation]);

  const startAnimationToCorner = useCallback(
    (from: CornerSnapPoint, velocity: CornerSnapPoint, nextCorner: CornerSnapCorner) => {
      const corners = getCornerPositions(getViewportSize(), getWidgetSize(), inset);

      cornerRef.current = nextCorner;
      setCorner(nextCorner);
      if (persistPosition) {
        writeStoredCorner(widgetId, nextCorner);
      }

      animationRef.current = createCornerSnapAnimation(from, velocity, corners[nextCorner]);
      setAnimating(true);
    },
    [getWidgetSize, inset, persistPosition, widgetId]
  );

  const animateToNearestCorner = useCallback(
    (from: CornerSnapPoint, velocity: CornerSnapPoint) => {
      const widgetSize = getWidgetSize();
      const corners = getCornerPositions(getViewportSize(), widgetSize, inset);
      const restPoint = {
        x: decayRestPos(from.x, velocity.x),
        y: decayRestPos(from.y, velocity.y)
      };
      const nextCorner = nearestCorner(restPoint, corners, widgetSize);
      startAnimationToCorner(from, velocity, nextCorner);
    },
    [getWidgetSize, inset, startAnimationToCorner]
  );

  const measureAndResnap = useCallback(() => {
    if (!enabled || !rootNode) {
      return;
    }

    const measuredSize = getWidgetSize();
    if (measuredSize.width <= 0 || measuredSize.height <= 0) {
      return;
    }

    if (dragSessionRef.current) {
      return;
    }

    cancelAnimation();
    snapToCorner(cornerRef.current);
  }, [cancelAnimation, enabled, getWidgetSize, rootNode, snapToCorner]);

  useEffect(() => {
    cornerRef.current = corner;
  }, [corner]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation();
      setDragging(false);
      dragSessionRef.current = null;
      return;
    }

    if (!persistPosition) {
      clearStoredCorner(widgetId);
      snapToCorner(defaultCorner);
      return;
    }

    const storedCorner = readStoredCorner(widgetId, defaultCorner);
    cornerRef.current = storedCorner;
    setCorner(storedCorner);
    snapToCorner(storedCorner);
  }, [cancelAnimation, defaultCorner, enabled, persistPosition, snapToCorner, widgetId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (lastWidgetIdRef.current === widgetId) {
      return;
    }

    lastWidgetIdRef.current = widgetId;

    const storedCorner = persistPosition ? readStoredCorner(widgetId, defaultCorner) : defaultCorner;
    cornerRef.current = storedCorner;
    setCorner(storedCorner);
    cancelAnimation();
    setDragging(false);
    dragSessionRef.current = null;
    snapToCorner(storedCorner);
  }, [cancelAnimation, defaultCorner, enabled, persistPosition, snapToCorner, widgetId]);

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    measureAndResnap();
  }, [enabled, measureAndResnap, measurementKey]);

  useEffect(() => {
    if (!enabled || !rootNode) {
      return;
    }

    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", measureAndResnap);
      return () => {
        window.removeEventListener("resize", measureAndResnap);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      measureAndResnap();
    });

    resizeObserver.observe(rootNode);
    window.addEventListener("resize", measureAndResnap);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureAndResnap);
    };
  }, [enabled, measureAndResnap, rootNode]);

  useEffect(() => {
    return () => {
      cancelAnimation();
    };
  }, [cancelAnimation]);

  const updateDragPosition = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const dragSession = dragSessionRef.current;
    if (!dragSession || dragSession.pointerId !== pointerId) {
      return;
    }

    const now = performance.now();
    pointerHistoryRef.current.push({
      x: clientX,
      y: clientY,
      time: now
    });
    if (pointerHistoryRef.current.length > MAX_POINTER_SAMPLES) {
      pointerHistoryRef.current.shift();
    }

    if (!dragSession.dragActivated && dragSession.handleKind === "launcher") {
      const distance = Math.hypot(
        clientX - dragSession.startPointer.x,
        clientY - dragSession.startPointer.y
      );

      if (distance < DRAG_THRESHOLD_PX) {
        return;
      }
    }

    dragSession.dragActivated = true;
    setDragging(true);
    setClampedPositionState({
      x: clientX - dragSession.offset.x,
      y: clientY - dragSession.offset.y
    });
  }, [setClampedPositionState]);

  const finishDrag = useCallback(
    (pointerId: number, reason: "up" | "cancel", clientX?: number, clientY?: number) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== pointerId) {
        return;
      }

      if (typeof clientX === "number" && typeof clientY === "number") {
        pointerHistoryRef.current.push({
          x: clientX,
          y: clientY,
          time: performance.now()
        });
        if (pointerHistoryRef.current.length > MAX_POINTER_SAMPLES) {
          pointerHistoryRef.current.shift();
        }
      }

      dragSessionRef.current = null;

      if (dragSession.handleElement.hasPointerCapture?.(pointerId)) {
        dragSession.handleElement.releasePointerCapture(pointerId);
      }

      const didDrag = dragSession.dragActivated;
      setDragging(false);

      if (!didDrag) {
        return;
      }

      if (dragSession.handleKind === "launcher") {
        suppressLauncherClickRef.current = true;
      }

      const velocity = reason === "up"
        ? estimateVelocity(pointerHistoryRef.current, performance.now())
        : { x: 0, y: 0 };
      animateToNearestCorner(positionRef.current, velocity);
      ensureAnimationLoop();
    },
    [animateToNearestCorner, ensureAnimationLoop]
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, handleKind: DragHandleKind) => {
      if (!enabled || !draggable) {
        return;
      }

      if (isDragBlocked(event.target, event.currentTarget)) {
        return;
      }

      cancelAnimation();

      const widgetPosition = getWidgetPosition();
      setPositionState(widgetPosition);
      getWidgetSize();

      dragSessionRef.current = {
        handleElement: event.currentTarget,
        dragActivated: false,
        handleKind,
        offset: {
          x: event.clientX - widgetPosition.x,
          y: event.clientY - widgetPosition.y
        },
        pointerId: event.pointerId,
        startPointer: {
          x: event.clientX,
          y: event.clientY
        }
      };

      pointerHistoryRef.current = [
        {
          x: event.clientX,
          y: event.clientY,
          time: performance.now()
        }
      ];
      suppressLauncherClickRef.current = false;

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cancelAnimation, draggable, enabled, getWidgetPosition, getWidgetSize, setPositionState]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateDragPosition(event.pointerId, event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishDrag(event.pointerId, "up", event.clientX, event.clientY);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishDrag(event.pointerId, "cancel", event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [enabled, finishDrag, updateDragPosition]);

  const consumeLauncherClickSuppression = useCallback(() => {
    const shouldSuppress = suppressLauncherClickRef.current;
    suppressLauncherClickRef.current = false;
    return shouldSuppress;
  }, []);

  const getHandleProps = useCallback(
    (handleKind: DragHandleKind) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        startDrag(event, handleKind);
      }
    }),
    [startDrag]
  );

  return {
    animating,
    corner,
    consumeLauncherClickSuppression,
    dragging,
    getHandleProps,
    position,
    rootRef
  };
}
