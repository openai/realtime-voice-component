import { type UseGhostCursorReturn } from "realtime-voice-component";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  createChangeDemoTool,
  createSendMessageTool,
  getInteractiveDemoPath
} from "../shared/tools";
import { useSharedDemoController } from "../shared/session";
import { buildThemeStateMessage, type Theme, THEME_DEMO_INSTRUCTIONS } from "./config";
import { createSetThemeTool } from "./tools";

type UseThemeDemoVoiceControllerOptions = {
  getThemeButton: (theme: Theme) => HTMLButtonElement | null;
  runCursor: UseGhostCursorReturn["run"];
  setTheme: (theme: Theme) => void;
  theme: Theme;
};

export function useThemeDemoVoiceController({
  getThemeButton,
  runCursor,
  setTheme,
  theme
}: UseThemeDemoVoiceControllerOptions) {
  const navigate = useNavigate();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const tools = useMemo(
    () => [
      createSetThemeTool({
        getTheme: () => themeRef.current,
        getThemeButton,
        runCursor,
        setTheme
      }),
      createChangeDemoTool({
        getActiveDemo: () => "theme",
        getDemoTab: (demo) =>
          document.querySelector<HTMLElement>(`[data-ai-target="demo-tab-${demo}"]`),
        navigateToDemo: (demo) => {
          navigate(getInteractiveDemoPath(demo));
        },
        runCursor
      }),
      createSendMessageTool()
    ],
    [getThemeButton, navigate, runCursor, setTheme]
  );

  const { controller, runtime } = useSharedDemoController({
    demoId: "theme",
    instructions: THEME_DEMO_INSTRUCTIONS,
    postToolResponse: false,
    tools
  });

  useEffect(() => {
    if (!runtime.connected) {
      return;
    }

    controller.sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildThemeStateMessage(theme)
          }
        ]
      }
    });
  }, [controller, runtime.connected, theme]);

  return {
    controller,
    runtime
  };
}
