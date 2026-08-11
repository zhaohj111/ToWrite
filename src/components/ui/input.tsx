import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-8 w-full rounded-lg border border-line bg-panel-3/60 px-3 text-sm text-fg caret-accent placeholder:text-fg-muted/70 transition-colors outline-none hover:border-line-strong focus:border-accent/40",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
