import { useEffect, useRef, useState } from "react";

import { usePorcupine } from "@picovoice/porcupine-react";

const KEYWORD_LABEL = "Hey Chappie";
const KEYWORD_PUBLIC_PATH = "/porcupine/hey-chappie_en_wasm_v4_0_0.ppn";
const MODEL_PUBLIC_PATH = "/porcupine/porcupine_params.pv";
const DETECTION_COOLDOWN_MS = 3000;

type WakeWordStatus = "checking" | "error" | "loading" | "off" | "ready" | "unavailable";

type UseWakeWordActivationOptions = {
  enabled: boolean;
  canActivateWidget: boolean;
  onWakeWord: (label: string) => boolean;
};

type WakeWordState = {
  status: WakeWordStatus;
  detail: string;
  hasAccessKey: boolean;
  keywordLabel: string;
  keywordPath: string;
  modelPath: string;
};

function formatMissingAssets(paths: string[]) {
  return paths.map((path) => path.split("/").at(-1) ?? path).join(", ");
}

async function assetExists(publicPath: string) {
  const assetUrl = new URL(publicPath, window.location.origin);

  try {
    const response = await fetch(assetUrl, {
      cache: "no-store",
      method: "HEAD"
    });

    if (response.ok) {
      return true;
    }

    if (response.status !== 405 && response.status !== 501) {
      return false;
    }
  } catch {
    // Fall back to GET below.
  }

  try {
    const response = await fetch(assetUrl, {
      cache: "no-store"
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useWakeWordActivation({
  enabled,
  canActivateWidget,
  onWakeWord
}: UseWakeWordActivationOptions): WakeWordState {
  const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY?.trim() ?? "";
  const hasAccessKey = accessKey.length > 0;
  const lastDetectionAtRef = useRef(0);
  const lastObservedDetectionRef = useRef<{ label: string } | null>(null);
  const [status, setStatus] = useState<WakeWordStatus>(hasAccessKey ? "off" : "unavailable");
  const [detail, setDetail] = useState(
    hasAccessKey
      ? "Wake word is off."
      : "Add VITE_PICOVOICE_ACCESS_KEY to demo/.env.local to enable the wake word."
  );
  const [assetsReady, setAssetsReady] = useState(false);
  const { error, init, isLoaded, isListening, keywordDetection, release, start, stop } =
    usePorcupine();

  useEffect(() => {
    let cancelled = false;

    if (!hasAccessKey) {
      setAssetsReady(false);
      setStatus("unavailable");
      setDetail("Add VITE_PICOVOICE_ACCESS_KEY to demo/.env.local to enable the wake word.");
      void release();
      return () => {
        cancelled = true;
      };
    }

    if (!enabled) {
      setAssetsReady(false);
      setStatus("off");
      setDetail("Wake word is off.");
      void release();
      return () => {
        cancelled = true;
      };
    }

    async function initializeWakeWord() {
      setAssetsReady(false);
      setStatus("checking");
      setDetail("Checking wake-word assets...");

      const requiredPaths = [KEYWORD_PUBLIC_PATH, MODEL_PUBLIC_PATH];
      const availability = await Promise.all(requiredPaths.map((path) => assetExists(path)));

      if (cancelled) {
        return;
      }

      const missingPaths = requiredPaths.filter((_, index) => !availability[index]);
      if (missingPaths.length > 0) {
        setStatus("error");
        setDetail(`Missing Porcupine asset(s): ${formatMissingAssets(missingPaths)}.`);
        return;
      }

      setAssetsReady(true);
      setStatus("loading");
      setDetail("Loading Hey Chappie wake word...");

      await release();
      if (cancelled) {
        return;
      }

      await init(
        accessKey,
        {
          label: KEYWORD_LABEL,
          publicPath: KEYWORD_PUBLIC_PATH
        },
        {
          publicPath: MODEL_PUBLIC_PATH
        }
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
  }, [assetsReady, canActivateWidget, enabled, hasAccessKey, isLoaded, isListening, start, stop]);

  useEffect(() => {
    if (!enabled || !hasAccessKey) {
      return;
    }

    if (error) {
      setStatus("error");
      setDetail(error.message);
      return;
    }

    if (isListening) {
      setStatus("ready");
      setDetail('Listening for "Hey Chappie"...');
      return;
    }

    if (isLoaded) {
      setStatus("loading");
      setDetail("Wake word is ready. Starting the microphone...");
    }
  }, [enabled, error, hasAccessKey, isLoaded, isListening]);

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

    if (activated && isListening) {
      // Release the wake-word mic before WebRTC opens its own capture stream.
      void stop();
    }
  }, [canActivateWidget, enabled, hasAccessKey, isListening, keywordDetection, onWakeWord, stop]);

  return {
    status,
    detail,
    hasAccessKey,
    keywordLabel: KEYWORD_LABEL,
    keywordPath: KEYWORD_PUBLIC_PATH,
    modelPath: MODEL_PUBLIC_PATH
  };
}
