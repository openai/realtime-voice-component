import { defineVoiceTool, type UseGhostCursorReturn } from "realtime-voice-component";
import { toast } from "sonner";
import { z } from "zod";

export const INTERACTIVE_DEMO_IDS = ["theme", "form", "chess"] as const;

export type InteractiveDemoId = (typeof INTERACTIVE_DEMO_IDS)[number];

const INTERACTIVE_DEMO_PATHS: Record<InteractiveDemoId, string> = {
  chess: "/demo/chess",
  form: "/demo/form",
  theme: "/demo/theme"
};

export function getInteractiveDemoPath(demo: InteractiveDemoId) {
  return INTERACTIVE_DEMO_PATHS[demo];
}

export function createSendMessageTool() {
  return defineVoiceTool({
    name: "send_message",
    description: "Show a short message to the user in a toast.",
    parameters: z.object({
      message: z.string().min(1).max(160)
    }),
    async execute({ message }) {
      toast(message);
      return { ok: true, message };
    }
  });
}

type CreateChangeDemoToolOptions = {
  getActiveDemo: () => InteractiveDemoId;
  getDemoTab: (demo: InteractiveDemoId) => HTMLElement | null;
  navigateToDemo: (demo: InteractiveDemoId) => void;
  runCursor: UseGhostCursorReturn["run"];
};

export function createChangeDemoTool({
  getActiveDemo,
  getDemoTab,
  navigateToDemo,
  runCursor
}: CreateChangeDemoToolOptions) {
  return defineVoiceTool({
    name: "change_demo",
    description:
      "Switch between the interactive demos when the user asks for another example or requests something only available there.",
    parameters: z.object({
      demo: z.enum(INTERACTIVE_DEMO_IDS)
    }),
    async execute({ demo }) {
      if (getActiveDemo() === demo) {
        return {
          ok: true,
          demo,
          path: INTERACTIVE_DEMO_PATHS[demo],
          changed: false,
          alreadyActive: true
        };
      }

      const target = getDemoTab(demo);

      await runCursor(
        {
          element: target,
          pulseElement: target
        },
        async () => {
          navigateToDemo(demo);
        },
        {
          easing: "smooth",
          from: "previous"
        }
      );

      return {
        ok: true,
        demo,
        path: INTERACTIVE_DEMO_PATHS[demo],
        changed: true,
        alreadyActive: false
      };
    }
  });
}
