export type CornerSnapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type CornerSnapPoint = {
  x: number;
  y: number;
};

export type CornerSnapSize = {
  width: number;
  height: number;
};

export type SpringConfig = {
  pos: number;
  dest: number;
  v: number;
  k: number;
  b: number;
};

export type CornerSnapAnimation = {
  animatedUntilTime: number | null;
  restPos: CornerSnapPoint;
  spring1x: SpringConfig;
  spring1y: SpringConfig;
  spring2x: SpringConfig;
  spring2y: SpringConfig;
};

const MS_PER_ANIMATION_STEP = 4;
const MAX_ANIMATION_STEPS_PER_FRAME = 300;
const DECAY_FRICTION = 4.5;
const DEFAULT_SPRING_STIFFNESS = 290;
const DEFAULT_SPRING_DAMPING = 24;

export function getViewportSize(): CornerSnapSize {
  return {
    width: document.documentElement.clientWidth || window.innerWidth || 0,
    height: document.documentElement.clientHeight || window.innerHeight || 0
  };
}

export function getCornerPositions(
  viewport: CornerSnapSize,
  widgetSize: CornerSnapSize,
  inset: number
): Record<CornerSnapCorner, CornerSnapPoint> {
  const rightX = Math.max(inset, viewport.width - widgetSize.width - inset);
  const bottomY = Math.max(inset, viewport.height - widgetSize.height - inset);

  return {
    "top-left": { x: inset, y: inset },
    "top-right": { x: rightX, y: inset },
    "bottom-left": { x: inset, y: bottomY },
    "bottom-right": { x: rightX, y: bottomY }
  };
}

export function clampPositionToViewport(
  point: CornerSnapPoint,
  viewport: CornerSnapSize,
  widgetSize: CornerSnapSize,
  inset: number
): CornerSnapPoint {
  const minX = inset;
  const minY = inset;
  const maxX = Math.max(inset, viewport.width - widgetSize.width - inset);
  const maxY = Math.max(inset, viewport.height - widgetSize.height - inset);

  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY)
  };
}

export function nearestCorner(
  point: CornerSnapPoint,
  corners: Record<CornerSnapCorner, CornerSnapPoint>,
  widgetSize: CornerSnapSize = { width: 0, height: 0 }
): CornerSnapCorner {
  let bestCorner: CornerSnapCorner = "top-left";
  let bestDistance = Number.POSITIVE_INFINITY;
  const pointCenter = {
    x: point.x + widgetSize.width / 2,
    y: point.y + widgetSize.height / 2
  };

  for (const corner of Object.keys(corners) as CornerSnapCorner[]) {
    const candidate = corners[corner];
    const candidateCenter = {
      x: candidate.x + widgetSize.width / 2,
      y: candidate.y + widgetSize.height / 2
    };
    const distance =
      (candidateCenter.x - pointCenter.x) ** 2 + (candidateCenter.y - pointCenter.y) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCorner = corner;
    }
  }

  return bestCorner;
}

export function decayRestPos(pos: number, velocity: number) {
  return pos + velocity / DECAY_FRICTION;
}

function spring(
  pos: number,
  v = 0,
  k = DEFAULT_SPRING_STIFFNESS,
  b = DEFAULT_SPRING_DAMPING
): SpringConfig {
  return { pos, dest: pos, v, k, b };
}

function springStep(config: SpringConfig) {
  const t = MS_PER_ANIMATION_STEP / 1000;
  const springForce = -config.k * (config.pos - config.dest);
  const damperForce = -config.b * config.v;
  const acceleration = springForce + damperForce;
  const nextVelocity = config.v + acceleration * t;
  const nextPosition = config.pos + nextVelocity * t;

  config.pos = nextPosition;
  config.v = nextVelocity;
}

function springGoToEnd(config: SpringConfig) {
  config.pos = config.dest;
  config.v = 0;
}

function springMostlyDone(config: SpringConfig) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01;
}

export function createCornerSnapAnimation(
  from: CornerSnapPoint,
  velocity: CornerSnapPoint,
  target: CornerSnapPoint
): CornerSnapAnimation {
  const restPos = {
    x: decayRestPos(from.x, velocity.x),
    y: decayRestPos(from.y, velocity.y)
  };

  const spring1x = spring(from.x, velocity.x);
  spring1x.dest = restPos.x;

  const spring1y = spring(from.y, velocity.y);
  spring1y.dest = restPos.y;

  const spring2x = spring(restPos.x);
  spring2x.dest = target.x;

  const spring2y = spring(restPos.y);
  spring2y.dest = target.y;

  return {
    animatedUntilTime: null,
    restPos,
    spring1x,
    spring1y,
    spring2x,
    spring2y
  };
}

function getCornerSnapPosition(animation: CornerSnapAnimation): CornerSnapPoint {
  return {
    x: animation.spring1x.pos + (animation.spring2x.pos - animation.restPos.x),
    y: animation.spring1y.pos + (animation.spring2y.pos - animation.restPos.y)
  };
}

export function stepCornerSnapAnimation(
  animation: CornerSnapAnimation,
  now: number
): {
  animating: boolean;
  position: CornerSnapPoint;
} {
  let animatedUntilTime =
    animation.animatedUntilTime !== null ? animation.animatedUntilTime : now;
  const steps = Math.min(
    MAX_ANIMATION_STEPS_PER_FRAME,
    Math.floor((now - animatedUntilTime) / MS_PER_ANIMATION_STEP)
  );

  animatedUntilTime += steps * MS_PER_ANIMATION_STEP;

  let animating = false;
  const springs = [
    animation.spring1x,
    animation.spring1y,
    animation.spring2x,
    animation.spring2y
  ];

  for (const config of springs) {
    for (let index = 0; index < steps; index += 1) {
      springStep(config);
    }

    if (springMostlyDone(config)) {
      springGoToEnd(config);
    } else {
      animating = true;
    }
  }

  animation.animatedUntilTime = animating ? animatedUntilTime : null;

  return {
    animating,
    position: getCornerSnapPosition(animation)
  };
}
