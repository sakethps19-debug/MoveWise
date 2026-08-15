import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  children: ReactNode;
}

/** Square icon-only button — always requires an aria-label, never an icon alone. */
export function IconButton({ className, children, ...rest }: IconButtonProps) {
  return (
    <button className={["mw-icon-btn", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
