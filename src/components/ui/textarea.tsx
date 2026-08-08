import * as React from "react";
import { cn } from "@/lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex w-full rounded-lg border border-line bg-panel-3/60 px-3 py-2 text-sm text-fg caret-accent placeholder:text-fg-muted/70 transition-colors hover:border-line-strong focus:border-accent/50 focus:bg-panel-3 focus:outline-none focus:ring-2 focus:ring-accent/25",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
