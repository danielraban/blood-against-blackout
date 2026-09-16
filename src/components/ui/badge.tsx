import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center border-2 border-black bg-black px-2.5 text-sm font-semibold uppercase text-warn",
        className,
      )}
      {...props}
    />
  );
}
