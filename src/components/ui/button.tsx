import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 border-2 border-black px-4 text-base font-semibold tracking-wide shadow-[4px_4px_0_0_#000] transition-colors disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-hot text-accent-fg hover:bg-accent",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-card",
        outline: "border-black bg-card text-foreground hover:bg-hot hover:text-accent-fg",
        danger: "bg-danger text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant }), className)} {...props} />
  );
}
