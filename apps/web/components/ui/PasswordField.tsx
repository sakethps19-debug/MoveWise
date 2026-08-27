"use client";

import { useId, useState } from "react";

export interface PasswordFieldProps {
  id?: string;
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password";
  required?: boolean;
  minLength?: number;
  /** Static help text under the field, e.g. "At least 8 characters." */
  helpText?: string;
  /** Fires on every keystroke so a caller can drive inline validation feedback. */
  onValueChange?: (value: string) => void;
}

/** A password input with a show/hide toggle — used by every password field in the app (login, signup, reset). */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  required,
  minLength,
  helpText,
  onValueChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const helpId = `${fieldId}-help`;

  return (
    <div className="mw-field">
      <label className="mw-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="mw-password-field">
        <input
          className="mw-input"
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          aria-describedby={helpText ? helpId : undefined}
          onChange={(e) => onValueChange?.(e.target.value)}
        />
        <button
          type="button"
          className="mw-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {helpText && (
        <p id={helpId} className="mw-field-help">
          {helpText}
        </p>
      )}
    </div>
  );
}
