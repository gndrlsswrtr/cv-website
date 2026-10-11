import type { FormState } from "@/lib/form-state";

/**
 * State for the inline settings forms. They sit on the settings page rather
 * than on their own route, so a successful save reports back through the
 * form state (with a message) instead of redirecting.
 */
export type SettingsFormState = FormState & { message?: string };
