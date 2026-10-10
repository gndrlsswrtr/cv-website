/** Shared shape returned from admin forms via `useActionState`. */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export const EMPTY_STATE: FormState = {};
