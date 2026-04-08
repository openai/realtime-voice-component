import type { CSSProperties } from "react";

import { cx } from "../internal/cx";
import type {
  GhostCursorOverlayProps,
  GhostCursorSpriteState
} from "../types";

export function GhostCursorOverlay({ state, className }: GhostCursorOverlayProps) {
  const renderCursor = (cursor: GhostCursorSpriteState) => (
    <div
      key={cursor.id}
      aria-hidden="true"
      className={cx("vc-ghost-cursor", className)}
      data-phase={cursor.phase}
      data-role={cursor.role}
      style={
        {
          "--vc-ghost-cursor-duration": `${cursor.durationMs}ms`,
          "--vc-ghost-cursor-fade": `${cursor.fade ?? 1}`,
          "--vc-ghost-cursor-timing":
            cursor.easing === "expressive"
              ? "cubic-bezier(0.16, 1.18, 0.3, 1)"
              : "cubic-bezier(0.22, 0.84, 0.26, 1)",
          "--vc-ghost-cursor-x": `${cursor.position.x}px`,
          "--vc-ghost-cursor-y": `${cursor.position.y}px`
        } as CSSProperties
      }
    >
      <span className="vc-ghost-cursor__halo" />
      <span className="vc-ghost-cursor__trail" />
      <span className="vc-ghost-cursor__pointer">
        <span className="vc-ghost-cursor__core" />
      </span>
    </div>
  );

  const visibleMainCursor = state.main.phase === "hidden" ? null : state.main;

  return (
    <>
      {visibleMainCursor ? renderCursor(visibleMainCursor) : null}
      {state.satellites.map(renderCursor)}
    </>
  );
}
