import { useEffect, useRef, useState } from "react";

import { usePorcupine } from "@picovoice/porcupine-react";

const KEYWORD_LABEL = "Hey Chappie";
const KEYWORD_PUBLIC_PATH = "/porcupine/hey-chappie_en_wasm_v4_0_0.ppn";
const MODEL_PUBLIC_PATH = "/porcupine/porcupine_params.pv";
const DETECTION_COOLDOWN_MS = 3000;
const HAS_TRIGGERED_STORAGE_KEY = "demo:wake-word-triggered-once";

function readHasTriggeredOnce() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(HAS_TRIGGERED_STORAGE_KEY) === "true";
}

function writeHasTriggeredOnce(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.sessionStorage.setItem(HAS_TRIGGERED_STORAGE_KEY, "true");
    return;
  }

  window.sessionStorage.removeItem(HAS_TRIGGERED_STORAGE_KEY);
}

export type WakeWordStatus =
  | "checking"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

type UseWakeWordActivationOptions = {
  enabled: boolean;
  canActivateWidget: boolean;
  onWakeWord: (label: string) => boolean;
};

export type WakeWordState = {
  assetsAvailable: boolean;
  status: WakeWordStatus;
  detail: string;
  hasTriggeredOnce: boolean;
  hasAccessKey: boolean;
  keywordLabel: string;
  keywordPath: string;
  modelPath: string;
};

type WakeWordSetupState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "missing-assets"; detail: string }
  | { phase: "ready" };

function formatMissingAssets(paths: string[]) {
  return paths.map((path) => path.split("/").at(-1) ?? path).join(", ");
}

function isAssetResponse(response: Response) {
  return response.ok &&
    !response.headers.get("content-type")?.toLowerCase().includes("text/html");
}

async function assetExists(publicPath: string) {
  const assetUrl = new URL(publicPath, window.location.origin);

  try {
    const response = await fetch(assetUrl, {
      cache: "no-store",
      method: "HEAD",
    });

    if (response.ok) {
      return isAssetResponse(response);
    }

    if (response.status !== 405 && response.status !== 501) {
      return false;
    }
  } catch {
    // Fall back to GET below.
  }

  try {
    const response = await fetch(assetUrl, {
      cache: "no-store",
    });
    return isAssetResponse(response);
  } catch {
    return false;
  }
}

export function useWakeWordActivation({
  enabled,
  canActivateWidget,
  onWakeWord,
}: UseWakeWordActivationOptions): WakeWordState {
  const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY?.trim() ?? "";
  const hasAccessKey = accessKey.length > 0;
  const lastDetectionAtRef = useRef(0);
  const lastObservedDetectionRef = useRef<{ label: string } | null>(null);
  const [hasTriggeredOnce, setHasTriggeredOnce] = useState(readHasTriggeredOnce);
  const [setupState, setSetupState] = useState<WakeWordSetupState>(() =>
    enabled ? { phase: "checking" } : { phase: "idle" },
  );
  const [assetsReady, setAssetsReady] = useState(false);
  const {
    error,
    init,
    isLoaded,
    isListening,
    keywordDetection,
    release,
    start,
    stop,
  } = usePorcupine();

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setHasTriggeredOnce(false);
      writeHasTriggeredOnce(false);
      setSetupState({ phase: "idle" });
      setAssetsReady(false);
      void release();
      return () => {
        cancelled = true;
      };
    }

    async function initializeWakeWord() {
      setAssetsReady(false);
      setSetupState({ phase: "checking" });

      const requiredPaths = [KEYWORD_PUBLIC_PATH, MODEL_PUBLIC_PATH];
      const availability = await Promise.all(
        requiredPaths.map((path) => assetExists(path)),
      );

      if (cancelled) {
        return;
      }

      const missingPaths = requiredPaths.filter(
        (_, index) => !availability[index],
      );
      if (missingPaths.length > 0) {
        setAssetsReady(false);
        setSetupState({
          phase: "missing-assets",
          detail: `Missing Porcupine asset(s): ${formatMissingAssets(missingPaths)}.`,
        });
        return;
      }

      setSetupState({ phase: "ready" });

      if (!hasAccessKey) {
        setAssetsReady(false);
        void release();
        return;
      }

      setAssetsReady(true);

      await release();
      if (cancelled) {
        return;
      }

      await init(
        accessKey,
        {
          label: KEYWORD_LABEL,
          publicPath: KEYWORD_PUBLIC_PATH,
        },
        {
          publicPath: MODEL_PUBLIC_PATH,
        },
      );
    }

    void initializeWakeWord();

    return () => {
      cancelled = true;
    };
  }, [accessKey, enabled, hasAccessKey, init, release]);

  useEffect(() => {
    if (!enabled || !hasAccessKey || !assetsReady || !isLoaded) {
      return;
    }

    if (!canActivateWidget) {
      if (isListening) {
        void stop();
      }
      return;
    }

    if (!isListening) {
      void start();
    }
  }, [
    assetsReady,
    canActivateWidget,
    enabled,
    hasAccessKey,
    isLoaded,
    isListening,
    start,
    stop,
  ]);

  useEffect(() => {
    if (!keywordDetection) {
      lastObservedDetectionRef.current = null;
      return;
    }

    if (lastObservedDetectionRef.current === keywordDetection) {
      return;
    }

    lastObservedDetectionRef.current = keywordDetection;

    if (!enabled || !hasAccessKey || !canActivateWidget) {
      return;
    }

    const now = Date.now();
    if (now - lastDetectionAtRef.current < DETECTION_COOLDOWN_MS) {
      return;
    }

    lastDetectionAtRef.current = now;
    const activated = onWakeWord(keywordDetection.label);

    if (activated) {
      setHasTriggeredOnce(true);
      writeHasTriggeredOnce(true);
    }

    if (activated && isListening) {
      // Release the wake-word mic before WebRTC opens its own capture stream.
      void stop();
    }
  }, [
    canActivateWidget,
    enabled,
    hasAccessKey,
    isListening,
    keywordDetection,
    onWakeWord,
    stop,
  ]);

  const assetsAvailable = setupState.phase === "ready";
  let status: WakeWordStatus;
  let detail: string;

  if (!enabled) {
    status = "off";
    detail = "Wake word is off.";
  } else if (setupState.phase === "idle" || setupState.phase === "checking") {
    status = "checking";
    detail = "Checking wake-word assets...";
  } else if (setupState.phase === "missing-assets") {
    status = "unavailable";
    detail = setupState.detail;
  } else if (!hasAccessKey) {
    status = "unavailable";
    detail = "Add VITE_PICOVOICE_ACCESS_KEY to demo/.env.local to enable the wake word.";
  } else if (error) {
    status = "error";
    detail = error.message;
  } else if (isListening) {
    status = "ready";
    detail = 'Listening for "Hey Chappie"...';
  } else if (isLoaded) {
    status = "loading";
    detail = "Wake word is ready. Starting the microphone...";
  } else {
    status = "loading";
    detail = "Loading Hey Chappie wake word...";
  }

  return {
    assetsAvailable,
    status,
    detail,
    hasTriggeredOnce,
    hasAccessKey,
    keywordLabel: KEYWORD_LABEL,
    keywordPath: KEYWORD_PUBLIC_PATH,
    modelPath: MODEL_PUBLIC_PATH,
  };
}
