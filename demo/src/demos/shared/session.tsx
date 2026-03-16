import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import {
  createVoiceControlController,
  useVoiceControl,
  type UseVoiceControlOptions,
  type VoiceControlController
} from "realtime-voice-component";

type DemoSessionContextValue = {
  activeDemoIdRef: { current: string | null };
  controller: VoiceControlController;
};

type SharedDemoControllerBaseOptions = Pick<
  UseVoiceControlOptions,
  "instructions" | "postToolResponse" | "tools"
>;

type SharedDemoControllerOptions = SharedDemoControllerBaseOptions & {
  demoId: string;
};

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

function buildBaseControllerOptions(
  options: SharedDemoControllerBaseOptions
): UseVoiceControlOptions {
  return {
    auth: { tokenEndpoint: "/token" },
    activationMode: "vad",
    model: "gpt-realtime-1.5",
    outputMode: "tool-only",
    ...(options.instructions !== undefined ? { instructions: options.instructions } : {}),
    ...(options.postToolResponse !== undefined
      ? { postToolResponse: options.postToolResponse }
      : {}),
    tools: options.tools
  };
}

export function DemoSessionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() =>
    createVoiceControlController(
      buildBaseControllerOptions({
        instructions: "Demo session is initializing.",
        postToolResponse: false,
        tools: []
      })
    )
  );
  const [activeDemoIdRef] = useState<{ current: string | null }>(() => ({
    current: null
  }));

  useEffect(() => {
    return () => controller.destroy();
  }, [controller]);

  const value = useMemo(
    () => ({
      activeDemoIdRef,
      controller
    }),
    [activeDemoIdRef, controller]
  );

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useSharedDemoController(options: SharedDemoControllerOptions) {
  const context = useContext(DemoSessionContext);

  if (!context) {
    throw new Error("useSharedDemoController must be used inside DemoSessionProvider.");
  }

  const runtime = useVoiceControl(context.controller);

  useEffect(() => {
    const nextOptions = buildBaseControllerOptions(options);
    const previousDemoId = context.activeDemoIdRef.current;
    const demoChanged = previousDemoId !== null && previousDemoId !== options.demoId;
    const shouldReconnect = context.controller.connected || context.controller.activity === "connecting";

    context.activeDemoIdRef.current = options.demoId;

    if (demoChanged) {
      context.controller.disconnect();
      context.controller.clearToolCalls();
    }

    context.controller.configure(nextOptions);

    if (demoChanged && shouldReconnect) {
      void context.controller.connect();
    }
  }, [
    context.controller,
    options.demoId,
    options.instructions,
    options.postToolResponse,
    options.tools
  ]);

  return {
    controller: context.controller,
    runtime
  };
}

export function useOverviewDemoSession() {
  const context = useContext(DemoSessionContext);

  if (!context) {
    throw new Error("useOverviewDemoSession must be used inside DemoSessionProvider.");
  }

  useEffect(() => {
    const previousDemoId = context.activeDemoIdRef.current;
    const demoChanged = previousDemoId !== null && previousDemoId !== "overview";

    context.activeDemoIdRef.current = "overview";

    if (demoChanged) {
      context.controller.disconnect();
      context.controller.clearToolCalls();
    }

    context.controller.configure(
      buildBaseControllerOptions({
        instructions: "Overview page is active.",
        postToolResponse: false,
        tools: []
      })
    );
  }, [context.activeDemoIdRef, context.controller]);
}
