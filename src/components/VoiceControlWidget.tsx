import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";

import { cx } from "../internal/cx";
import {
  readVersionedLocalStorageValue,
  removeLocalStorageValues,
  writeLocalStorageValue
} from "../internal/storage";
import { useCornerSnap } from "../internal/useCornerSnap";
import { useVoiceControl } from "../useVoiceControl";
import type {
  VoiceControlWidgetCorner,
  VoiceControlWidgetLabels,
  VoiceControlWidgetPart,
  VoiceControlWidgetProps
} from "../types";

const DEFAULT_MOBILE_BREAKPOINT = 640;
const DEFAULT_LAUNCHER_SIZE = { width: 74, height: 44 };
const DEFAULT_COMPACT_LAUNCHER_SIZE = { width: 44, height: 44 };
const DEFAULT_CORNER_SNAP_INSET = 16;
const DEFAULT_CORNER_SNAP_CORNER: VoiceControlWidgetCorner = "bottom-right";
const DEFAULT_LAUNCHER_ERROR_TOAST_DURATION_MS = 4000;
const POSITION_STORAGE_VERSION = "v1";
const POSITION_STORAGE_PREFIX = `voice-control-position:${POSITION_STORAGE_VERSION}:`;
const LEGACY_POSITION_STORAGE_PREFIX = "voice-control-position:";
const DRAG_THRESHOLD = 4;
const DEFAULT_WIDGET_LABELS: VoiceControlWidgetLabels = {
  launcher: "Voice",
  disconnected: "Disconnected"
};
const DEFAULT_WIDGET_PART_CLASS_NAMES: Partial<Record<VoiceControlWidgetPart, string>> = {
  root: "vc-root",
  launcher: "vc-launcher",
  "launcher-toast": "vc-launcher-toast",
  "launcher-action": "vc-launcher-action",
  "launcher-status": "vc-sr-only vc-launcher-status",
  "launcher-label": "vc-sr-only vc-launcher-label",
  "launcher-handle": "vc-launcher-handle",
  "launcher-separator": "vc-launcher-separator",
  "launcher-core": "vc-launcher-core",
  "launcher-indicator": "vc-launcher-indicator",
  "launcher-drag-glyph": "vc-launcher-drag-glyph"
};
const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  border: 0,
  clip: "rect(0, 0, 0, 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px"
};

type LauncherVisualState = "busy" | "connecting" | "error" | "idle" | "listening" | "live";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useViewportMatch(maxWidth: number) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(mediaQuery.matches);

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    legacyMediaQuery.addListener?.(handleChange);
    return () => {
      legacyMediaQuery.removeListener?.(handleChange);
    };
  }, [maxWidth]);

  return matches;
}

function positionStorageKey(widgetId: string) {
  return `${POSITION_STORAGE_PREFIX}${widgetId}`;
}

function legacyPositionStorageKey(widgetId: string) {
  return `${LEGACY_POSITION_STORAGE_PREFIX}${widgetId}`;
}

function readStoredPosition(widgetId: string) {
  return readVersionedLocalStorageValue({
    currentKey: positionStorageKey(widgetId),
    fallback: { x: 0, y: 0 },
    legacyKeys: [legacyPositionStorageKey(widgetId)],
    parse: (raw) => {
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      return {
        x: typeof parsed.x === "number" ? parsed.x : 0,
        y: typeof parsed.y === "number" ? parsed.y : 0
      };
    }
  });
}

function clearStoredPosition(widgetId: string) {
  removeLocalStorageValues([positionStorageKey(widgetId), legacyPositionStorageKey(widgetId)]);
}

function isDefaultPosition(position: { x: number; y: number }) {
  return position.x === 0 && position.y === 0;
}

function resolveSnapInset(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : DEFAULT_CORNER_SNAP_INSET;
}

function resolveSnapDefaultCorner(
  value: VoiceControlWidgetCorner | undefined
): VoiceControlWidgetCorner {
  if (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  ) {
    return value;
  }

  return DEFAULT_CORNER_SNAP_CORNER;
}

function getAnchoredSnapStyle(
  corner: VoiceControlWidgetCorner,
  inset: number
): CSSProperties {
  return {
    bottom: corner.startsWith("bottom") ? `${inset}px` : "auto",
    left: corner.endsWith("left") ? `${inset}px` : "auto",
    pointerEvents: "auto",
    position: "absolute",
    right: corner.endsWith("right") ? `${inset}px` : "auto",
    top: corner.startsWith("top") ? `${inset}px` : "auto",
    transform: "none"
  };
}

function getWidgetStatus(
  state: {
    activity: string;
    connected: boolean;
    status: string;
  },
  disconnectedLabel: string
) {
  if (state.status === "connecting") {
    return "Connecting";
  }

  if (state.status === "error" || state.activity === "error") {
    return "Error";
  }

  if (!state.connected) {
    return disconnectedLabel;
  }

  if (
    state.status === "processing" ||
    state.activity === "processing" ||
    state.activity === "executing"
  ) {
    return "Working";
  }

  if (state.status === "listening" || state.activity === "listening") {
    return "Listening";
  }

  return "Ready";
}

function getLauncherVisualState(state: {
  activity: string;
  connected: boolean;
  status: string;
}): LauncherVisualState {
  if (state.status === "connecting" || state.activity === "connecting") {
    return "connecting";
  }

  if (state.status === "error" || state.activity === "error") {
    return "error";
  }

  if (
    state.status === "processing" ||
    state.activity === "processing" ||
    state.activity === "executing"
  ) {
    return "busy";
  }

  if (state.status === "listening" || state.activity === "listening") {
    return "listening";
  }

  return state.connected ? "live" : "idle";
}

function renderLauncherIndicatorIcon(visualState: LauncherVisualState, unstyled: boolean) {
  switch (visualState) {
    case "busy":
      return (
        <svg
          aria-hidden="true"
          className={cx(!unstyled && "vc-launcher-busy-icon")}
          viewBox="0 0 16 16"
        >
          <path
            className={cx(!unstyled && "vc-launcher-busy-line", !unstyled && "vc-launcher-busy-line--1")}
            d="M2.25 5.5h11.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            className={cx(!unstyled && "vc-launcher-busy-line", !unstyled && "vc-launcher-busy-line--2")}
            d="M4 8h8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            className={cx(!unstyled && "vc-launcher-busy-line", !unstyled && "vc-launcher-busy-line--3")}
            d="M5.75 10.5h4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "connecting":
      return (
        <svg
          aria-hidden="true"
          className={cx(!unstyled && "vc-launcher-connecting-icon")}
          viewBox="0 0 16 16"
        >
          <circle
            className={cx(
              !unstyled && "vc-launcher-connecting-dot",
              !unstyled && "vc-launcher-connecting-dot--1"
            )}
            cx="3"
            cy="8"
            fill="currentColor"
            r="1.25"
          />
          <circle
            className={cx(
              !unstyled && "vc-launcher-connecting-dot",
              !unstyled && "vc-launcher-connecting-dot--2"
            )}
            cx="8"
            cy="8"
            fill="currentColor"
            r="1.25"
          />
          <circle
            className={cx(
              !unstyled && "vc-launcher-connecting-dot",
              !unstyled && "vc-launcher-connecting-dot--3"
            )}
            cx="13"
            cy="8"
            fill="currentColor"
            r="1.25"
          />
        </svg>
      );
    case "error":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <circle cx="8" cy="11.75" fill="currentColor" r="1" />
          <path
            d="M8 3.25v5.75"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "listening":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <rect
            fill="none"
            height="6.5"
            rx="2.75"
            stroke="currentColor"
            strokeWidth="1.5"
            width="5.5"
            x="5.25"
            y="2.25"
          />
          <path
            d="M3.75 7.75a4.25 4.25 0 0 0 8.5 0M8 12v1.75M5.5 13.75h5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "live":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <circle cx="8" cy="8" fill="currentColor" r="3.25" />
          <circle
            cx="8"
            cy="8"
            fill="none"
            r="5.25"
            stroke="currentColor"
            strokeOpacity="0.24"
            strokeWidth="1.5"
          />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path
            d="M5 3.5l6.25 4.5L5 12.5z"
            fill="currentColor"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="0.6"
          />
        </svg>
      );
  }
}

function renderLauncherHandleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 24">
      <circle cx="4" cy="3.75" fill="currentColor" r="1.1" />
      <circle cx="8" cy="3.75" fill="currentColor" r="1.1" />
      <circle cx="4" cy="9.25" fill="currentColor" r="1.1" />
      <circle cx="8" cy="9.25" fill="currentColor" r="1.1" />
      <circle cx="4" cy="14.75" fill="currentColor" r="1.1" />
      <circle cx="8" cy="14.75" fill="currentColor" r="1.1" />
      <circle cx="4" cy="20.25" fill="currentColor" r="1.1" />
      <circle cx="8" cy="20.25" fill="currentColor" r="1.1" />
    </svg>
  );
}

export function VoiceControlWidget({
  widgetId = "voice-control-widget",
  className,
  controller,
  controllerRef,
  draggable = true,
  persistPosition = true,
  snapToCorners = false,
  snapInset,
  snapDefaultCorner,
  partClassNames,
  labels,
  layout = "floating",
  mobileLayout,
  mobileBreakpoint = DEFAULT_MOBILE_BREAKPOINT,
  unstyled = false
}: VoiceControlWidgetProps) {
  const runtime = useVoiceControl(controller);
  if (controllerRef) {
    controllerRef.current = controller;
  }
  const resolvedLabels = {
    ...DEFAULT_WIDGET_LABELS,
    ...labels
  };
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragPositionRef = useRef({ x: 0, y: 0 });
  const suppressLauncherClickRef = useRef(false);
  const launcherToastTimeoutRef = useRef<number | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [launcherToastMessage, setLauncherToastMessage] = useState<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const isMobileViewport = useViewportMatch(mobileBreakpoint);
  const resolvedMobileLayout = mobileLayout ?? layout;
  const resolvedLayout = isMobileViewport ? resolvedMobileLayout : layout;
  const draggableInLayout = draggable && resolvedLayout === "floating";
  const snapToCornersEnabled = snapToCorners && resolvedLayout === "floating";
  const resolvedSnapInset = resolveSnapInset(snapInset);
  const resolvedSnapDefaultCorner = resolveSnapDefaultCorner(snapDefaultCorner);
  const fallbackSize = draggableInLayout ? DEFAULT_LAUNCHER_SIZE : DEFAULT_COMPACT_LAUNCHER_SIZE;
  const cornerSnap = useCornerSnap({
    defaultCorner: resolvedSnapDefaultCorner,
    draggable,
    enabled: snapToCornersEnabled,
    fallbackSize,
    inset: resolvedSnapInset,
    measurementKey: `${resolvedLayout}:${draggableInLayout ? "handle" : "compact"}`,
    persistPosition,
    widgetId
  });

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setPortalContainer(document.body);
  }, []);

  const clearLauncherToast = () => {
    if (launcherToastTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(launcherToastTimeoutRef.current);
      launcherToastTimeoutRef.current = null;
    }

    setLauncherToastMessage(null);
  };

  const hasLauncherError = runtime.status === "error" || runtime.activity === "error";

  useEffect(() => {
    if (!controllerRef) {
      return;
    }

    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  useEffect(() => {
    if (snapToCornersEnabled) {
      return;
    }

    dragPositionRef.current = position;
  }, [position, snapToCornersEnabled]);

  useEffect(() => {
    if (!hasLauncherError) {
      return;
    }

    setLauncherToastMessage("Couldn't connect. Press the voice button to retry.");
    if (typeof window === "undefined") {
      return;
    }

    if (launcherToastTimeoutRef.current !== null) {
      window.clearTimeout(launcherToastTimeoutRef.current);
    }

    launcherToastTimeoutRef.current = window.setTimeout(() => {
      launcherToastTimeoutRef.current = null;
      setLauncherToastMessage(null);
    }, DEFAULT_LAUNCHER_ERROR_TOAST_DURATION_MS);

    return () => {
      if (launcherToastTimeoutRef.current !== null) {
        window.clearTimeout(launcherToastTimeoutRef.current);
        launcherToastTimeoutRef.current = null;
      }
    };
  }, [hasLauncherError]);

  useEffect(() => {
    if (!runtime.connected) {
      return;
    }

    clearLauncherToast();
  }, [runtime.connected]);

  useEffect(() => {
    return () => {
      if (launcherToastTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(launcherToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (snapToCornersEnabled) {
      return;
    }

    if (resolvedLayout !== "floating") {
      setDragging(false);
      return;
    }

    if (!persistPosition) {
      clearStoredPosition(widgetId);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const storedPosition = readStoredPosition(widgetId);
    dragPositionRef.current = storedPosition;
    setPosition(storedPosition);
  }, [persistPosition, resolvedLayout, snapToCornersEnabled, widgetId]);

  useEffect(() => {
    if (snapToCornersEnabled) {
      return;
    }

    if (resolvedLayout !== "floating" || !persistPosition || dragging) {
      return;
    }

    if (isDefaultPosition(position)) {
      clearStoredPosition(widgetId);
      return;
    }

    if (typeof window !== "undefined") {
      writeLocalStorageValue(positionStorageKey(widgetId), JSON.stringify(position));
    }
  }, [dragging, persistPosition, position, resolvedLayout, snapToCornersEnabled, widgetId]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!draggableInLayout || snapToCornersEnabled) {
      return;
    }

    const target = event.target as Element | null;
    const interactiveAncestor = target?.closest?.(
      "button,[role='button'],input,select,textarea,[contenteditable='true'],[data-vc-no-drag]"
    );

    if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
      return;
    }

    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
    dragOffsetRef.current = {
      x: event.clientX - dragPositionRef.current.x,
      y: event.clientY - dragPositionRef.current.y
    };
    setDragging(true);

    const captureTarget = event.currentTarget as HTMLElement & {
      setPointerCapture?: (pointerId: number) => void;
    };
    captureTarget.setPointerCapture?.(event.pointerId);
  };

  const onDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || snapToCornersEnabled) {
      return;
    }

    const nextPosition = {
      x: event.clientX - dragOffsetRef.current.x,
      y: event.clientY - dragOffsetRef.current.y
    };

    dragPositionRef.current = nextPosition;
    setPosition(nextPosition);
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || snapToCornersEnabled) {
      return;
    }

    const movedX = Math.abs(event.clientX - dragStartRef.current.x);
    const movedY = Math.abs(event.clientY - dragStartRef.current.y);
    if (movedX > DRAG_THRESHOLD || movedY > DRAG_THRESHOLD) {
      suppressLauncherClickRef.current = true;
    }

    setDragging(false);

    const captureTarget = event.currentTarget as HTMLElement & {
      releasePointerCapture?: (pointerId: number) => void;
    };
    captureTarget.releasePointerCapture?.(event.pointerId);
  };

  const resolvedPosition = snapToCornersEnabled ? cornerSnap.position : position;
  const resolvedDragging = snapToCornersEnabled ? cornerSnap.dragging : dragging;
  const launcherHandleProps = snapToCornersEnabled ? cornerSnap.getHandleProps("launcher") : null;
  const rootStyle: CSSProperties = resolvedLayout === "floating"
    ? snapToCornersEnabled
      ? cornerSnap.dragging || cornerSnap.animating
        ? {
            bottom: "auto",
            left: 0,
            pointerEvents: "auto",
            position: "absolute",
            right: "auto",
            top: 0,
            transform: `translate3d(${resolvedPosition.x}px, ${resolvedPosition.y}px, 0)`
          }
        : getAnchoredSnapStyle(cornerSnap.corner, resolvedSnapInset)
      : { transform: `translate(${resolvedPosition.x}px, ${resolvedPosition.y}px)` }
    : {};
  const snapOverlayStyle: CSSProperties | null = snapToCornersEnabled
    ? {
        inset: 0,
        pointerEvents: "none",
        position: "fixed",
        zIndex: "var(--vc-z-index)"
      }
    : null;
  const launcherStatusText = getWidgetStatus(runtime, resolvedLabels.disconnected);
  const launcherVisualState = getLauncherVisualState(runtime);
  const launcherStatusId = `${widgetId}-launcher-status`;
  const dragHandleLabel = "Drag widget";
  const launcherActionLabel =
    launcherVisualState === "connecting"
      ? `${resolvedLabels.launcher} is connecting`
      : launcherVisualState === "error"
        ? `Retry ${resolvedLabels.launcher}`
        : runtime.connected
          ? `Disconnect ${resolvedLabels.launcher}`
          : `Start ${resolvedLabels.launcher}`;

  const handleLauncherAction = () => {
    if (launcherVisualState === "connecting") {
      return;
    }

    if (launcherVisualState === "error") {
      void runtime.connect();
      return;
    }

    if (runtime.connected) {
      runtime.disconnect();
      return;
    }

    void runtime.connect();
  };
  const resolveWidgetPartClassName = (
    part: VoiceControlWidgetPart,
    ...extraClassNames: Array<string | false | null | undefined>
  ) =>
    cx(
      !unstyled && DEFAULT_WIDGET_PART_CLASS_NAMES[part],
      partClassNames?.[part],
      ...extraClassNames
    );

  const widgetRoot = (
    <div
      ref={snapToCornersEnabled ? cornerSnap.rootRef : undefined}
      className={cx(resolveWidgetPartClassName("root"), className)}
      style={rootStyle}
      data-vc-part="root"
      data-vc-activity={runtime.activity}
      data-vc-connected={String(runtime.connected)}
      data-vc-dragging={String(resolvedDragging)}
      data-vc-draggable={String(draggableInLayout)}
      data-vc-layout={resolvedLayout}
    >
      {launcherToastMessage ? (
        <div
          className={resolveWidgetPartClassName("launcher-toast")}
          data-vc-part="launcher-toast"
          role="status"
          aria-live="polite"
        >
          {launcherToastMessage}
        </div>
      ) : null}

      <div
        className={resolveWidgetPartClassName("launcher")}
        data-vc-part="launcher"
        data-vc-draggable={String(draggableInLayout)}
        data-vc-has-handle={String(draggableInLayout)}
        data-vc-launcher-state={launcherVisualState}
      >
        <button
          className={resolveWidgetPartClassName("launcher-action")}
          data-vc-part="launcher-action"
          aria-describedby={launcherStatusId}
          aria-label={launcherActionLabel}
          onClick={() => {
            if (
              snapToCornersEnabled
                ? cornerSnap.consumeLauncherClickSuppression()
                : suppressLauncherClickRef.current
            ) {
              suppressLauncherClickRef.current = false;
              return;
            }

            handleLauncherAction();
          }}
          type="button"
        >
          <span
            className={resolveWidgetPartClassName("launcher-core")}
            data-vc-part="launcher-core"
            aria-hidden="true"
          >
            <span
              className={resolveWidgetPartClassName(
                "launcher-indicator",
                !unstyled && `vc-launcher-indicator--${launcherVisualState}`
              )}
              data-vc-part="launcher-indicator"
            >
              {renderLauncherIndicatorIcon(launcherVisualState, unstyled)}
            </span>
          </span>
          <span
            id={launcherStatusId}
            className={resolveWidgetPartClassName("launcher-status")}
            data-vc-part="launcher-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={VISUALLY_HIDDEN_STYLE}
          >
            {launcherStatusText}
          </span>
          <span
            className={resolveWidgetPartClassName("launcher-label")}
            data-vc-part="launcher-label"
            style={VISUALLY_HIDDEN_STYLE}
          >
            {resolvedLabels.launcher}
          </span>
        </button>

        {draggableInLayout ? (
          <>
            <span
              className={resolveWidgetPartClassName("launcher-separator")}
              data-vc-part="launcher-separator"
              aria-hidden="true"
            />
            <button
              className={resolveWidgetPartClassName("launcher-handle")}
              data-vc-part="launcher-handle"
              aria-label={dragHandleLabel}
              onDoubleClick={(event) => event.preventDefault()}
              onPointerDown={
                snapToCornersEnabled
                  ? launcherHandleProps?.onPointerDown
                  : (event) => beginDrag(event)
              }
              onPointerMove={snapToCornersEnabled ? undefined : onDrag}
              onPointerUp={snapToCornersEnabled ? undefined : endDrag}
              onPointerCancel={snapToCornersEnabled ? undefined : endDrag}
              type="button"
            >
              <span
                className={resolveWidgetPartClassName("launcher-drag-glyph")}
                data-vc-part="launcher-drag-glyph"
                aria-hidden="true"
              >
                {renderLauncherHandleIcon()}
              </span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  if (!snapToCornersEnabled) {
    return widgetRoot;
  }

  const snapOverlay = (
    <div
      className={resolveWidgetPartClassName("overlay")}
      data-vc-part="overlay"
      style={snapOverlayStyle ?? undefined}
    >
      {widgetRoot}
    </div>
  );

  return portalContainer ? createPortal(snapOverlay, portalContainer) : snapOverlay;
}
