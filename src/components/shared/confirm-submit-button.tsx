"use client";

import type { ButtonHTMLAttributes } from "react";

/** A submit button that asks first; the form's server action still runs. */
export function ConfirmSubmitButton({ message, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
