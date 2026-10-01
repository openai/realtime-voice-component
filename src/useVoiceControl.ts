import { useEffect, useRef, useSyncExternalStore } from "react";

import { createVoiceControlController, isVoiceControlController } from "./voiceControlController";
import type {
  UseVoiceControlInput,
  UseVoiceControlOptions,
  UseVoiceControlReturn,
  VoiceControlController,
} from "./types";

type ControllerBinding = {
  controller: VoiceControlController;
  owned: boolean;
};

function createBinding(input: UseVoiceControlInput): ControllerBinding {
  if (isVoiceControlController(input)) {
    return {
      controller: input,
      owned: false,
    };
  }

  return {
    controller: createVoiceControlController({ ...input, autoConnect: false }),
    owned: true,
  };
}

export function useVoiceControl(options: UseVoiceControlOptions): UseVoiceControlReturn;
export function useVoiceControl(controller: VoiceControlController): UseVoiceControlReturn;
export function useVoiceControl(input: UseVoiceControlInput): UseVoiceControlReturn;
export function useVoiceControl(input: UseVoiceControlInput): UseVoiceControlReturn {
  const bindingRef = useRef<ControllerBinding | null>(null);
  const activeControllerRef = useRef<VoiceControlController | null>(null);

  if (bindingRef.current === null) {
    bindingRef.current = createBinding(input);
  } else if (isVoiceControlController(input)) {
    if (bindingRef.current.controller !== input || bindingRef.current.owned) {
      bindingRef.current = {
        controller: input,
        owned: false,
      };
    }
  } else if (!bindingRef.current.owned) {
    bindingRef.current = {
      controller: createVoiceControlController({ ...input, autoConnect: false }),
      owned: true,
    };
  }

  const { controller, owned } = bindingRef.current;

  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  const latestInputRef = useRef<UseVoiceControlInput>(input);
  latestInputRef.current = input;

  useEffect(() => {
    const latestInput = latestInputRef.current;

    if (owned && !isVoiceControlController(latestInput) && bindingRef.current?.owned) {
      bindingRef.current.controller.configure(latestInput);
    }
  }, [input, owned]);

  useEffect(() => {
    activeControllerRef.current = controller;

    return () => {
      activeControllerRef.current = null;
      if (owned) {
        // Strict Mode replays effects with the same controller. Dispose only
        // after that replay has had a chance to reattach it.
        queueMicrotask(() => {
          if (activeControllerRef.current !== controller) {
            controller.destroy();
          }
        });
      }
    };
  }, [controller, owned]);

  return controller;
}
