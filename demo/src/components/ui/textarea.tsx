import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "cn-textarea flex field-sizing-content min-h-32 w-full rounded-[16px] border border-field-border bg-field px-4 py-3 text-base text-field-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/90 focus-visible:border-ring/70 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
