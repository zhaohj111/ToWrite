import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-on-accent shadow-accent hover:-translate-y-px hover:bg-accent-strong",
        secondary:
          "border border-line bg-panel-3/70 text-fg hover:border-line-strong hover:bg-hover",
        ghost: "text-fg-muted hover:bg-hover hover:text-fg",
        destructive:
          "border border-danger/25 bg-danger/10 text-danger hover:border-danger/40 hover:bg-danger/20",
        outline: "border border-line text-fg hover:border-line-strong hover:bg-hover",
      },
      size: {
        default: "h-8 px-4",
        sm: "h-7 px-3 text-xs",
        icon: "h-7 w-7",
        lg: "h-10 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
