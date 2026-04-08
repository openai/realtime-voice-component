export const SIMPLE_FORM_FIELD_KEYS = [
  "name",
  "birthday",
  "newsletter_opt_in",
  "accept_terms",
  "notes",
] as const;

export type SimpleFormFieldKey = (typeof SIMPLE_FORM_FIELD_KEYS)[number];

export type SimpleFormValues = {
  name: string;
  birthday: string;
  newsletterOptIn: boolean;
  acceptTerms: boolean;
  notes: string;
};

export type SimpleFormFieldStatus = {
  key: SimpleFormFieldKey;
  label: string;
};

export type SimpleFormValidationResult = {
  errors: Partial<Record<SimpleFormFieldKey, string>>;
  invalidFields: SimpleFormFieldKey[];
};

export type SimpleFormCompletionSnapshot = {
  blockingFields: SimpleFormFieldStatus[];
  completedRequiredCount: number;
  missingRequired: SimpleFormFieldStatus[];
  readyToSubmit: boolean;
  requiredTotalCount: number;
};

export const DEFAULT_SIMPLE_FORM_VALUES: SimpleFormValues = {
  name: "",
  birthday: "",
  newsletterOptIn: false,
  acceptTerms: false,
  notes: "",
};

const FIELD_LABELS: Record<SimpleFormFieldKey, string> = {
  accept_terms: "Accept terms",
  birthday: "Birthday",
  name: "Name",
  newsletter_opt_in: "Newsletter opt-in",
  notes: "Notes",
};

const FIELD_REQUIREMENTS = [
  { key: "name", required: true },
  { key: "birthday", required: true },
  { key: "newsletter_opt_in", required: false },
  { key: "accept_terms", required: true },
  { key: "notes", required: false },
] as const satisfies ReadonlyArray<{
  key: SimpleFormFieldKey;
  required: boolean;
}>;

export const FORM_DEMO_INSTRUCTIONS = [
  "You are a concise voice assistant controlling a simple form demo in a React app.",
  "Part of what you hear from Jason will be demo narration explaining realtime-voice-component and your abilities. Do not take actions for that narration; only call tools when it sounds like Jason is giving you an instruction. Treat phrases like \"alright, let's get into the demo\" as a cue that directed demo instructions may follow.",
  "You control the visible UI with tools. This is not a general chat.",
  "You have exactly five tools: set_field, get_unfilled_fields, submit_form, change_demo, and send_message.",
  "If a tool can satisfy the request, call the tool instead of replying in text.",
  'Use set_field with exactly one field per call in the shape { "key": "<field_key>", "value": "<string>" }.',
  "After each tool call, rely on the follow-up response to continue filling the next field when needed.",
  "Supported field keys are name, birthday, newsletter_opt_in, accept_terms, and notes.",
  "Use YYYY-MM-DD for birthday.",
  "Use yes or no for newsletter_opt_in and accept_terms.",
  "Use get_unfilled_fields when the request is partial, unclear, or missing required information.",
  'Use change_demo with { "demo": "theme" } when the user asks for the theme example, light mode, dark mode, or the simple theme-switching demo.',
  'Use change_demo with { "demo": "chess" } when the user asks for chess, a chessboard, hints, a best move, or to play a move.',
  "Use send_message when you need one short follow-up question or a short confirmation toast.",
  "Use submit_form only when the user explicitly asks to submit, save, or send the form.",
  "If the user asks for both edits and submission, finish the field updates first and submit last.",
  "Do not invent extra fields, nested objects, or unsupported tools.",
  "Keep any text reply short and action-focused.",
].join(" ");

function isBlank(value: string) {
  return value.trim().length === 0;
}

function isValidBirthday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3) {
    return false;
  }

  const [year, month, day] = parts as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getSimpleFormFieldLabel(key: SimpleFormFieldKey) {
  return FIELD_LABELS[key];
}

export function buildUnfilledFieldsSnapshot(values: SimpleFormValues) {
  const required: SimpleFormFieldStatus[] = [];
  const optional: SimpleFormFieldStatus[] = [];

  for (const field of FIELD_REQUIREMENTS) {
    const target = field.required ? required : optional;

    if (field.key === "name" && isBlank(values.name)) {
      target.push({ key: field.key, label: FIELD_LABELS[field.key] });
      continue;
    }

    if (field.key === "birthday" && !isValidBirthday(values.birthday)) {
      target.push({ key: field.key, label: FIELD_LABELS[field.key] });
      continue;
    }

    if (field.key === "accept_terms" && !values.acceptTerms) {
      target.push({ key: field.key, label: FIELD_LABELS[field.key] });
      continue;
    }

    if (field.key === "newsletter_opt_in" && !values.newsletterOptIn) {
      target.push({ key: field.key, label: FIELD_LABELS[field.key] });
      continue;
    }

    if (field.key === "notes" && isBlank(values.notes)) {
      target.push({ key: field.key, label: FIELD_LABELS[field.key] });
    }
  }

  return {
    ok: true as const,
    required,
    optional,
    suggested: (required.length > 0 ? required : optional).slice(0, 3),
    requiredCount: required.length,
    optionalCount: optional.length,
  };
}

export function validateSimpleForm(
  values: SimpleFormValues,
): SimpleFormValidationResult {
  const errors: Partial<Record<SimpleFormFieldKey, string>> = {};

  if (isBlank(values.name)) {
    errors.name = "Name is required.";
  }

  if (!isValidBirthday(values.birthday)) {
    errors.birthday = "Birthday is required.";
  }

  if (!values.acceptTerms) {
    errors.accept_terms = "You need to accept the terms before submitting.";
  }

  if (values.notes.trim().length > 280) {
    errors.notes = "Notes must be at most 280 characters.";
  }

  return {
    errors,
    invalidFields: Object.keys(errors) as SimpleFormFieldKey[],
  };
}

export function buildSimpleFormCompletionSnapshot(
  values: SimpleFormValues,
): SimpleFormCompletionSnapshot {
  const unfilled = buildUnfilledFieldsSnapshot(values);
  const validation = validateSimpleForm(values);
  const requiredTotalCount = FIELD_REQUIREMENTS.filter(
    (field) => field.required,
  ).length;

  return {
    blockingFields: validation.invalidFields.map((field) => ({
      key: field,
      label: FIELD_LABELS[field],
    })),
    completedRequiredCount: requiredTotalCount - unfilled.required.length,
    missingRequired: unfilled.required,
    readyToSubmit: validation.invalidFields.length === 0,
    requiredTotalCount,
  };
}

export function buildSimpleFormStateMessage(values: SimpleFormValues) {
  const unfilled = buildUnfilledFieldsSnapshot(values);
  const required =
    unfilled.required.map((field) => field.key).join(", ") || "none";
  const optional =
    unfilled.optional.map((field) => field.key).join(", ") || "none";

  return [
    "Form state update: the visible simple form has these current values.",
    `name=${values.name.trim() || "<empty>"}.`,
    `birthday=${values.birthday || "<empty>"}.`,
    `newsletter_opt_in=${values.newsletterOptIn ? "yes" : "no"}.`,
    `accept_terms=${values.acceptTerms ? "yes" : "no"}.`,
    `notes=${values.notes.trim() || "<empty>"}.`,
    `Required fields still missing or invalid: ${required}.`,
    `Optional fields still blank or unset: ${optional}.`,
  ].join(" ");
}
