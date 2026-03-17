import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  GhostCursorOverlay,
  useGhostCursor,
  VoiceControlWidget,
} from "realtime-voice-component";

import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import {
  DemoCard,
  DemoIntro,
  DemoPageShell,
  DemoSection,
  DemoWakeWordStatus,
} from "../shared/primitives";
import { type Theme } from "./config";
import { useThemeDemoVoiceController } from "./controller";
import { useWakeWordActivation } from "../shared/wakeWord";

const THEME_OPTION_STYLE =
  "h-auto min-h-24 w-full flex-col items-start gap-3 rounded-[16px] border border-border bg-panel px-5 py-5 text-left shadow-none transition-colors hover:border-foreground/15 hover:bg-muted/60";

export function ThemeDemoPage() {
  const [theme, setThemeState] = useState<Theme>("light");
  const { cursorState, run } = useGhostCursor();
  const themeButtonRefs = useRef<Record<Theme, HTMLButtonElement | null>>({
    dark: null,
    light: null,
  });

  const applyTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);
  const getThemeButton = useCallback(
    (nextTheme: Theme) => themeButtonRefs.current[nextTheme],
    [],
  );
  const { controller, runtime } = useThemeDemoVoiceController({
    getThemeButton,
    runCursor: run,
    setTheme: applyTheme,
    theme,
  });

  const canActivateFromWakeWord =
    !runtime.connected && runtime.activity !== "connecting";

  const activateWidgetFromWakeWord = useCallback(() => {
    if (!canActivateFromWakeWord) {
      return false;
    }

    void controller.connect();
    return true;
  }, [canActivateFromWakeWord, controller]);

  const handleWakeWord = useCallback(
    (_label: string) => activateWidgetFromWakeWord(),
    [activateWidgetFromWakeWord],
  );

  const wakeWord = useWakeWordActivation({
    enabled: true,
    canActivateWidget: canActivateFromWakeWord,
    onWakeWord: handleWakeWord,
  });

  return (
    <DemoPageShell theme={theme}>
      <GhostCursorOverlay state={cursorState} />

      <DemoCard>
        <DemoIntro
          eyebrow="Theme Demo"
          title="Set a visible app theme with a tiny tool surface."
          body="This demo highlights wake-word activation, tool calls, and voice-driven theme changes."
        />

        <DemoSection
          heading="Try Saying"
          aside={<DemoWakeWordStatus wakeWord={wakeWord} />}
          description={
            <>
              Say <strong>{wakeWord.keywordLabel}</strong> to wake it, ask for{" "}
              <strong>dark mode</strong> or <strong>light mode</strong> to
              change the theme, and say <strong>switch to the form demo</strong>{" "}
              to move to the other example.
            </>
          }
        />

        <DemoSection
          heading="Theme"
          description="Choose a palette with the same system button shape used across the demo."
        >
          <ToggleGroup
            type="single"
            value={theme}
            variant="outline"
            size="lg"
            spacing={3}
            className="flex w-full flex-col sm:flex-row [&>[data-slot=toggle-group-item]]:flex-1"
            onValueChange={(nextTheme) => {
              if (nextTheme === "light" || nextTheme === "dark") {
                applyTheme(nextTheme);
              }
            }}
          >
            <ToggleGroupItem
              ref={(node) => {
                themeButtonRefs.current.light = node;
              }}
              value="light"
              className={cn(
                THEME_OPTION_STYLE,
                theme === "light" && "border-foreground/15 shadow-sm",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-muted ring-1 ring-foreground/10">
                <SunIcon />
              </span>
              <CardHeader className="gap-1 p-0">
                <CardTitle className="text-base tracking-[-0.02em]">
                  Light mode
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  Bright and clear.
                </CardDescription>
              </CardHeader>
            </ToggleGroupItem>
            <ToggleGroupItem
              ref={(node) => {
                themeButtonRefs.current.dark = node;
              }}
              value="dark"
              className={cn(
                THEME_OPTION_STYLE,
                theme === "dark" &&
                  "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full ring-1",
                  theme === "dark"
                    ? "bg-primary-foreground/10 ring-primary-foreground/20"
                    : "bg-muted ring-foreground/10",
                )}
              >
                <MoonIcon />
              </span>
              <CardHeader className="gap-1 p-0">
                <CardTitle className="text-base tracking-[-0.02em]">
                  Dark mode
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  Black and focused.
                </CardDescription>
              </CardHeader>
            </ToggleGroupItem>
          </ToggleGroup>
        </DemoSection>

        <CardContent className="mt-10 p-0">
          <VoiceControlWidget controller={controller} snapToCorners />
        </CardContent>
      </DemoCard>
    </DemoPageShell>
  );
}
