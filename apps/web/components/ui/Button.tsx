import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  fullWidth?: boolean;
  children: ReactNode;
}

/** Direction A button primitive — see docs/design/system.md. */
export function Button({ variant = "primary", fullWidth, className, children, ...rest }: ButtonProps) {
  const classes = ["mw-btn", `mw-btn--${variant}`, fullWidth && "mw-btn--full", className].filter(Boolean).join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
