import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import type { BundledLanguage } from "shiki";
import { Link, NavLink } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type DemoTheme = "light" | "dark";

type DemoPageShellProps = PropsWithChildren<{
  theme?: DemoTheme;
}>;

type DemoCardProps = PropsWithChildren<{
  className?: string;
}>;

type DemoIntroProps = {
  eyebrow: string;
  title: string;
  body: ReactNode;
  emphasis?: ReactNode;
  actions?: ReactNode;
};

type DemoSectionProps = PropsWithChildren<{
  heading: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}>;

type DemoLinkCardProps = {
  eyebrow: string;
  title: string;
  body: ReactNode;
  to: string;
};

type DemoCodeBlockProps = {
  children: string;
  language?: DemoCodeLanguage;
};

const DEMO_NAV_ITEMS = [
  { id: "overview", label: "Overview", to: "/" },
  { id: "theme", label: "Theme Demo", to: "/demo/theme" },
  { id: "form", label: "Form Demo", to: "/demo/form" },
  { id: "chess", label: "Chess Demo", to: "/demo/chess" },
] as const;

type DemoCodeLanguage = Extract<BundledLanguage, "bash" | "javascript" | "tsx">;

const DEMO_CODE_THEME = "github-light";
const highlightedHtmlCache = new Map<string, Promise<string>>();

function getHighlightedCodeHtml(code: string, language: DemoCodeLanguage) {
  const cacheKey = `${language}:${code}`;
  const cachedHtml = highlightedHtmlCache.get(cacheKey);

  if (cachedHtml) {
    return cachedHtml;
  }

  const highlightedHtmlPromise = import("shiki").then(({ codeToHtml }) =>
    codeToHtml(code, {
      lang: language,
      theme: DEMO_CODE_THEME,
    }),
  );

  highlightedHtmlCache.set(cacheKey, highlightedHtmlPromise);
  return highlightedHtmlPromise;
}

function DemoEyebrow({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <p
      className={cn(
        "text-[0.76rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function DemoPageShell({
  children,
  theme = "light",
}: DemoPageShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-background px-4 py-6 text-foreground transition-colors sm:px-6",
        theme === "dark" && "dark",
      )}
      data-theme={theme}
    >
      <div className="mx-auto grid w-full max-w-[860px] gap-4 sm:gap-[18px]">
        <nav aria-label="Demo pages" className="flex flex-wrap gap-2.5">
          {DEMO_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              data-ai-target={`demo-tab-${item.id}`}
              className={({ isActive }) =>
                cn(
                  buttonVariants({
                    variant: isActive ? "default" : "outline",
                    size: "lg",
                  }),
                  "rounded-[14px] px-4 text-[0.95rem] shadow-none backdrop-blur-sm",
                  !isActive && "bg-panel text-foreground hover:bg-muted",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}

export function DemoCard({ children, className }: DemoCardProps) {
  return (
    <main data-testid="demo-card">
      <Card
        className={cn(
          "rounded-[20px] px-4 py-6 shadow-[0_1px_2px_rgba(17,17,17,0.03),0_18px_44px_rgba(17,17,17,0.04)] sm:px-10 sm:py-10",
          className,
        )}
      >
        {children}
      </Card>
    </main>
  );
}

export function DemoIntro({
  eyebrow,
  title,
  body,
  emphasis,
  actions,
}: DemoIntroProps) {
  return (
    <CardHeader className="gap-[18px] p-0">
      <DemoEyebrow>{eyebrow}</DemoEyebrow>
      <h1 className="max-w-[10ch] text-[clamp(3.1rem,8vw,5.2rem)] leading-[0.9] font-semibold tracking-[-0.075em]">
        {title}
      </h1>
      <CardDescription className="max-w-3xl text-[1.02rem] leading-[1.7] text-muted-foreground">
        {body}
      </CardDescription>
      {emphasis ? (
        <CardDescription className="-mt-0.5 max-w-3xl text-[1.02rem] leading-[1.7] text-muted-foreground [&_strong]:text-foreground [&_strong]:font-semibold">
          {emphasis}
        </CardDescription>
      ) : null}
      {actions ? <div className="grid gap-3.5">{actions}</div> : null}
    </CardHeader>
  );
}

export function DemoSection({
  heading,
  description,
  aside,
  children,
  className,
}: DemoSectionProps) {
  return (
    <section
      aria-label={heading}
      className={cn(
        "mt-10 grid gap-5 border-t border-border/80 pt-8",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="grid gap-2.5">
          <DemoEyebrow>{heading}</DemoEyebrow>
          {description ? (
            <p className="max-w-3xl text-[1.02rem] leading-[1.7] text-muted-foreground [&_strong]:text-foreground [&_strong]:font-semibold">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children ? <div className="grid gap-3.5">{children}</div> : null}
    </section>
  );
}

export function DemoCodeBlock({
  children,
  language = "javascript",
}: DemoCodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    setHighlightedHtml(null);

    getHighlightedCodeHtml(children, language)
      .then((html) => {
        if (!isCancelled) {
          setHighlightedHtml(html);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHighlightedHtml("");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [children, language]);

  if (!highlightedHtml) {
    return (
      <pre
        className="overflow-x-auto rounded-[16px] border border-border/80 bg-muted/55 p-4 text-sm leading-6"
        data-testid="demo-code-block"
      >
        <code>{children}</code>
      </pre>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-[16px] border border-border/80 bg-muted/55 p-4 [&_.shiki]:!bg-transparent [&_.shiki]:m-0 [&_.shiki]:overflow-x-auto [&_.shiki_pre]:!bg-transparent [&_.shiki_pre]:p-0"
      data-testid="demo-code-block"
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}

export function DemoLinkCard({ eyebrow, title, body, to }: DemoLinkCardProps) {
  return (
    <Link to={to}>
      <Card className="rounded-[16px] p-5 transition-transform duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_10px_20px_rgba(17,17,17,0.06)]">
        <CardContent className="grid gap-3 p-0">
          <DemoEyebrow>{eyebrow}</DemoEyebrow>
          <div className="text-[1.24rem] font-semibold tracking-[-0.03em]">
            {title}
          </div>
          <p className="text-[1.02rem] leading-[1.7] text-muted-foreground">
            {body}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DemoSectionDivider() {
  return <Separator className="mt-10" />;
}

export function DemoPrimaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="lg" {...props} />;
}
