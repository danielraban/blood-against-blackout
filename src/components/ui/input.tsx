import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Input({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-12 w-full border-2 border-black bg-card px-4 text-base text-foreground outline-none placeholder:text-muted focus:border-warn",
        className,
      )}
      {...props}
    />
  );
}
