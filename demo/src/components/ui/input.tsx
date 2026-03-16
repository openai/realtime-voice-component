import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "cn-input w-full min-w-0 rounded-[14px] border border-field-border bg-field px-4 py-3 text-base text-field-foreground outline-none transition-[border-color,box-shadow,background-color] file:inline-flex file:border-0 file:bg-transparent file:text-field-foreground placeholder:text-muted-foreground/90 focus-visible:border-ring/70 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-ring/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
