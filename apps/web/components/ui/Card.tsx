import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  accent?: boolean;
}

export function Card({ raised, accent, className, ...rest }: CardProps) {
  const classes = ["mw-card", raised && "mw-card--raised", accent && "mw-card--accent", className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes} {...rest} />;
}
