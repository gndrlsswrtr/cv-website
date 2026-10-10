"use client";

import { useRef, useState } from "react";

/**
 * Password input with a show/hide toggle.
 *
 * `autoComplete` is passed straight through so each field can declare its own
 * intent (`current-password` vs `new-password`).
 */
export function PasswordToggle({
  name,
  autoComplete,
  placeholder,
  required,
}: {
  name: string;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type={visible ? "text" : "password"}
        name={name}
        id={name}
        className="control pr-16"
        autoComplete={autoComplete}
        placeholder={placeholder}
        {...(required ? { required: true } : {})}
      />
      <button
        type="button"
        onClick={() => {
          const next = !visible;
          setVisible(next);
          // Keep the caret where it was so typing continues uninterrupted.
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-muted hover:text-foreground"
      >
        {visible ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}
