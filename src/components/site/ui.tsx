import type { ReactNode } from "react";

/** Titled content block used across every public page. */
export function Section({
  id,
  title,
  kicker,
  action,
  children,
}: {
  id?: string;
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          {kicker ? <p className="eyebrow mb-1.5">{kicker}</p> : null}
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Consistent heading block at the top of a sub-page. */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10 max-w-3xl">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{description}</p>
      ) : null}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="badge" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
      {children}
    </span>
  );
}

/** A link that makes it obvious it leaves the site. */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {children}
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}

/** Renders a textarea description: bullet lines become a list. */
export function Description({ text }: { text?: string | null }) {
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: { type: "p" | "ul"; items: string[] }[] = [];
  for (const line of lines) {
    const isBullet = /^[-*•]\s+/.test(line);
    const content = isBullet ? line.replace(/^[-*•]\s+/, "") : line;
    const last = blocks[blocks.length - 1];
    if (last && last.type === (isBullet ? "ul" : "p")) {
      last.items.push(content);
    } else {
      blocks.push({ type: isBullet ? "ul" : "p", items: [content] });
    }
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted sm:text-[0.9375rem]">
      {blocks.map((block, index) =>
        block.type === "ul" ? (
          <ul key={index} className="list-disc space-y-1.5 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.items.join(" ")}</p>
        ),
      )}
    </div>
  );
}
