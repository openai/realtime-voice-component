import { defineVoiceTool, type UseGhostCursorReturn } from "realtime-voice-component";
import { z } from "zod";

import type { Theme } from "./config";

type CreateSetThemeToolOptions = {
  getTheme: () => Theme;
  getThemeButton: (theme: Theme) => HTMLButtonElement | null;
  runCursor: UseGhostCursorReturn["run"];
  setTheme: (theme: Theme) => void;
};

export function createSetThemeTool({
  getTheme,
  getThemeButton,
  runCursor,
  setTheme
}: CreateSetThemeToolOptions) {
  return defineVoiceTool({
    name: "set_theme",
    description: "Switch the page theme between light and dark mode.",
    parameters: z.object({
      theme: z.enum(["light", "dark"])
    }),
    async execute({ theme }) {
      if (getTheme() === theme) {
        return {
          ok: true,
          theme,
          changed: false,
          alreadyActive: true,
          message: `Already in ${theme} mode.`
        };
      }

      const button = getThemeButton(theme);

      await runCursor(
        {
          element: button,
          pulseElement: button
        },
        async () => {
          setTheme(theme);
        },
        {
          easing: "smooth",
          from: "previous"
        }
      );

      return {
        ok: true,
        theme,
        changed: true,
        alreadyActive: false,
        message: `Theme changed to ${theme} mode.`
      };
    }
  });
}
