import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-primary-bright to-primary text-white shadow-[0_8px_30px_-8px_rgba(13,148,136,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(13,148,136,0.65)] hover:-translate-y-0.5",
        gold:
          "bg-gradient-to-b from-gold to-[#c9954f] text-[#1a1406] shadow-[0_8px_30px_-8px_rgba(229,181,103,0.5)] hover:-translate-y-0.5",
        secondary: "bg-elevated text-ink border border-line hover:bg-surface-2 hover:border-line",
        outline: "border border-line bg-transparent text-ink hover:bg-surface-2",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        glass: "glass text-ink hover:bg-surface-2/80",
        danger: "bg-danger/90 text-white hover:bg-danger",
        link: "text-primary-bright underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 px-5 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-[1.15rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
