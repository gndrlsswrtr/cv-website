"use client";

import type { ReactNode } from "react";

/**
 * Submit button that asks for confirmation first — used by destructive admin
 * actions (delete, replacing a file, loading sample content).
 */
export function ConfirmSubmit({
  message,
  children,
  className = "btn btn-danger",
  disabled,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
