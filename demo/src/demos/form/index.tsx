import {
  GhostCursorOverlay,
  useGhostCursor,
  VoiceControlWidget,
} from "realtime-voice-component";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import {
  DemoCard,
  DemoIntro,
  DemoPageShell,
  DemoSection,
  DemoWakeWordStatus,
} from "../shared/primitives";
import {
  buildSimpleFormStateMessage,
  DEFAULT_SIMPLE_FORM_VALUES,
  type SimpleFormFieldKey,
  type SimpleFormValues,
  validateSimpleForm,
} from "./config";
import { useFormDemoVoiceController } from "./controller";
import { useWakeWordActivation } from "../shared/wakeWord";

type SimpleFormErrorState = Partial<Record<SimpleFormFieldKey, string>>;

const FIELD_NAMES = {
  accept_terms: "acceptTerms",
  birthday: "birthday",
  name: "name",
  newsletter_opt_in: "newsletterOptIn",
  notes: "notes",
} as const satisfies Record<SimpleFormFieldKey, keyof SimpleFormValues>;

type CheckboxFieldCardProps = {
  checked: boolean;
  error?: string | undefined;
  hint: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  setRef: (node: HTMLButtonElement | null) => void;
  ariaLabel: string;
};

function CheckboxFieldCard({
  checked,
  error,
  hint,
  label,
  onCheckedChange,
  setRef,
  ariaLabel,
}: CheckboxFieldCardProps) {
  return (
    <label className="group block">
      <Card className="rounded-[16px] shadow-none transition-colors group-hover:border-foreground/15 group-hover:bg-muted/40">
        <CardContent className="p-0">
          <Field
            orientation="horizontal"
            className="items-start gap-4 px-4 py-4"
          >
            <Checkbox
              ref={setRef}
              aria-label={ariaLabel}
              checked={checked}
              onCheckedChange={(nextChecked) => {
                onCheckedChange(nextChecked === true);
              }}
              className="mt-0.5 transition-colors group-hover:border-foreground/20 group-hover:bg-muted"
            />
            <FieldContent className="gap-1">
              <FieldLabel className="font-medium text-foreground">
                {label}
              </FieldLabel>
              <FieldDescription>{hint}</FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldContent>
          </Field>
        </CardContent>
      </Card>
    </label>
  );
}

export function FormDemoPage() {
  const [formValues, setFormValues] = useState(DEFAULT_SIMPLE_FORM_VALUES);
  const [errors, setErrors] = useState<SimpleFormErrorState>({});
  const fieldRefs = useRef<Record<SimpleFormFieldKey, HTMLElement | null>>({
    accept_terms: null,
    birthday: null,
    name: null,
    newsletter_opt_in: null,
    notes: null,
  });
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const valuesRef = useRef(formValues);
  valuesRef.current = formValues;
  const { cursorState, run } = useGhostCursor();

  const clearFieldError = useCallback((key: SimpleFormFieldKey) => {
    setErrors((current) => {
      if (current[key] === undefined) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
  }, []);

  const setFieldValue = useCallback(
    (key: SimpleFormFieldKey, nextValue: boolean | string) => {
      clearFieldError(key);
      const nextValues = {
        ...valuesRef.current,
        [FIELD_NAMES[key]]: nextValue,
      };
      valuesRef.current = nextValues;
      setFormValues(nextValues);
    },
    [clearFieldError],
  );

  const applyFieldUpdate = useCallback(
    (update: {
      key: SimpleFormFieldKey;
      applyValue: boolean | string;
      value: string;
    }) => {
      const fieldName = FIELD_NAMES[update.key];
      const currentValue = valuesRef.current[fieldName];
      const alreadyActive = currentValue === update.applyValue;

      if (!alreadyActive) {
        setFieldValue(update.key, update.applyValue);
      }

      return {
        changed: !alreadyActive,
        alreadyActive,
      };
    },
    [setFieldValue],
  );

  const getFieldElement = useCallback(
    (key: SimpleFormFieldKey) => fieldRefs.current[key],
    [],
  );

  const handleTextFieldChange = useCallback(
    (key: "name" | "birthday" | "notes", value: string) => {
      clearFieldError(key);
      const nextValues = {
        ...valuesRef.current,
        [key]: value,
      };
      valuesRef.current = nextValues;
      setFormValues(nextValues);
    },
    [clearFieldError],
  );

  const handleCheckboxChange = useCallback(
    (key: "newsletter_opt_in" | "accept_terms", checked: boolean) => {
      clearFieldError(key);
      const nextValues = {
        ...valuesRef.current,
        [FIELD_NAMES[key]]: checked,
      };
      valuesRef.current = nextValues;
      setFormValues(nextValues);
    },
    [clearFieldError],
  );

  const submitCurrentForm = useCallback(async () => {
    const validation = validateSimpleForm(valuesRef.current);

    if (validation.invalidFields.length > 0) {
      setErrors(validation.errors);
      return {
        ok: false as const,
        invalidFields: validation.invalidFields,
      };
    }

    setErrors({});
    toast("Submitted demo form", {
      description: `${valuesRef.current.name} · ${valuesRef.current.birthday}`,
    });

    return {
      ok: true as const,
      submitted: { ...valuesRef.current },
    };
  }, []);

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      await submitCurrentForm();
    },
    [submitCurrentForm],
  );

  const getCurrentValues = useCallback(() => valuesRef.current, []);
  const getSubmitButton = useCallback(() => submitButtonRef.current, []);

  const { controller, runtime } = useFormDemoVoiceController({
    applyFieldUpdate,
    getFieldElement,
    getSubmitButton,
    getValues: getCurrentValues,
    runCursor: run,
    submitForm: submitCurrentForm,
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
            text: buildSimpleFormStateMessage(formValues),
          },
        ],
      },
    });
  }, [controller, formValues, runtime.connected]);

  const canActivateFromWakeWord =
    !runtime.connected && runtime.activity !== "connecting";

  const activateWidgetFromWakeWord = useCallback(() => {
    if (!canActivateFromWakeWord) {
      return false;
    }

    void controller.connect();
    return true;
  }, [canActivateFromWakeWord, controller]);

  const wakeWord = useWakeWordActivation({
    enabled: true,
    canActivateWidget: canActivateFromWakeWord,
    onWakeWord: () => activateWidgetFromWakeWord(),
  });

  return (
    <DemoPageShell>
      <GhostCursorOverlay state={cursorState} />

      <DemoCard>
        <DemoIntro
          eyebrow="Form Demo"
          title="Fill a simple form one field at a time."
          body="This demo highlights wake-word activation, field-by-field updates, and simple voice-driven form submission."
        />

        <DemoSection
          heading="Try Saying"
          aside={<DemoWakeWordStatus wakeWord={wakeWord} />}
          description={
            <>
              Say <strong>{wakeWord.keywordLabel}</strong> to wake it, ask it to{" "}
              <strong>
                fill the form with name Ada Lovelace, birthday 1815-12-10, and
                accept the terms
              </strong>
              , and say <strong>submit the form</strong> when the fields look
              right.
            </>
          }
        />

        <DemoSection
          heading="Simple Form"
          description="A single system of inputs, checkbox cards, and submission controls."
        >
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="demo-name">Name</FieldLabel>
                <Input
                  ref={(node) => {
                    fieldRefs.current.name = node;
                  }}
                  id="demo-name"
                  aria-invalid={Boolean(errors.name)}
                  aria-label="Name"
                  type="text"
                  value={formValues.name}
                  onChange={(event) => {
                    handleTextFieldChange("name", event.target.value);
                  }}
                  placeholder="Ada Lovelace"
                />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>

              <Field data-invalid={Boolean(errors.birthday)}>
                <FieldLabel htmlFor="demo-birthday">Birthday</FieldLabel>
                <Input
                  ref={(node) => {
                    fieldRefs.current.birthday = node;
                  }}
                  id="demo-birthday"
                  aria-invalid={Boolean(errors.birthday)}
                  aria-label="Birthday"
                  type="date"
                  value={formValues.birthday}
                  onChange={(event) => {
                    handleTextFieldChange("birthday", event.target.value);
                  }}
                />
                {errors.birthday ? (
                  <FieldError>{errors.birthday}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>

            <div className="grid gap-3 md:grid-cols-2">
              <CheckboxFieldCard
                ariaLabel="Newsletter opt-in"
                checked={formValues.newsletterOptIn}
                hint="Optional follow-up emails."
                label="Newsletter opt-in"
                onCheckedChange={(checked) => {
                  handleCheckboxChange("newsletter_opt_in", checked);
                }}
                setRef={(node) => {
                  fieldRefs.current.newsletter_opt_in = node;
                }}
              />
              <CheckboxFieldCard
                ariaLabel="Accept terms"
                checked={formValues.acceptTerms}
                error={errors.accept_terms}
                hint="Required before submission."
                label="Accept terms"
                onCheckedChange={(checked) => {
                  handleCheckboxChange("accept_terms", checked);
                }}
                setRef={(node) => {
                  fieldRefs.current.accept_terms = node;
                }}
              />
            </div>

            <Field data-invalid={Boolean(errors.notes)}>
              <FieldLabel htmlFor="demo-notes">Notes</FieldLabel>
              <Textarea
                ref={(node) => {
                  fieldRefs.current.notes = node;
                }}
                id="demo-notes"
                aria-invalid={Boolean(errors.notes)}
                aria-label="Notes"
                value={formValues.notes}
                onChange={(event) => {
                  handleTextFieldChange("notes", event.target.value);
                }}
                placeholder="Anything else you want the assistant to capture."
                rows={4}
              />
              <FieldDescription>
                Tool keys: {Object.keys(FIELD_NAMES).join(", ")}.
              </FieldDescription>
              {errors.notes ? <FieldError>{errors.notes}</FieldError> : null}
            </Field>

            <div className="flex justify-end">
              <Button
                ref={submitButtonRef}
                type="submit"
                size="lg"
                data-ai-target="submit-form"
              >
                Submit
              </Button>
            </div>
          </form>
        </DemoSection>

        <div className="mt-10">
          <VoiceControlWidget controller={controller} snapToCorners />
        </div>
      </DemoCard>
    </DemoPageShell>
  );
}
