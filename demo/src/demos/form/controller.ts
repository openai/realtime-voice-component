import {
  type UseGhostCursorReturn
} from "realtime-voice-component";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  createChangeDemoTool,
  createSendMessageTool,
  getInteractiveDemoPath
} from "../shared/tools";
import { useSharedDemoController } from "../shared/session";
import {
  FORM_DEMO_INSTRUCTIONS,
  type SimpleFormFieldKey,
  type SimpleFormValues
} from "./config";
import {
  createGetUnfilledFieldsTool,
  createSetFieldTool,
  createSubmitFormTool
} from "./tools";

type UseFormDemoVoiceControllerOptions = {
  applyFieldUpdate: (update: {
    key: SimpleFormFieldKey;
    applyValue: boolean | string;
    value: string;
  }) => {
    changed: boolean;
    alreadyActive: boolean;
  };
  getFieldElement: (key: SimpleFormFieldKey) => HTMLElement | null;
  getSubmitButton: () => HTMLButtonElement | null;
  getValues: () => SimpleFormValues;
  runCursor: UseGhostCursorReturn["run"];
  submitForm: () => Promise<
    { ok: true; submitted: SimpleFormValues } | { ok: false; invalidFields: SimpleFormFieldKey[] }
  >;
};

export function useFormDemoVoiceController({
  applyFieldUpdate,
  getFieldElement,
  getSubmitButton,
  getValues,
  runCursor,
  submitForm
}: UseFormDemoVoiceControllerOptions) {
  const navigate = useNavigate();

  const tools = useMemo(
    () => [
      createSetFieldTool({
        applyFieldUpdate,
        getFieldElement,
        runCursor
      }),
      createGetUnfilledFieldsTool({
        getValues
      }),
      createSubmitFormTool({
        getSubmitButton,
        runCursor,
        submitForm
      }),
      createChangeDemoTool({
        getActiveDemo: () => "form",
        getDemoTab: (demo) =>
          document.querySelector<HTMLElement>(`[data-ai-target="demo-tab-${demo}"]`),
        navigateToDemo: (demo) => {
          navigate(getInteractiveDemoPath(demo));
        },
        runCursor
      }),
      createSendMessageTool()
    ],
    [
      applyFieldUpdate,
      getFieldElement,
      getSubmitButton,
      getValues,
      navigate,
      runCursor,
      submitForm
    ]
  );

  const { controller, runtime } = useSharedDemoController({
    demoId: "form",
    instructions: FORM_DEMO_INSTRUCTIONS,
    postToolResponse: true,
    tools
  });

  return {
    controller,
    runtime
  };
}
