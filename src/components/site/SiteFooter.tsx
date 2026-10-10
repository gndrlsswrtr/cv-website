import Link from "next/link";

type FooterProfile = {
  full_name: string;
  footer_note: string;
  email: string;
  website: string;
  linkedin: string;
  github: string;
  x_url: string;
};

function labelFor(href: string, fallback: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host || fallback;
  } catch {
    return fallback;
  }
}

export function SiteFooter({ profile }: { profile: FooterProfile }) {
  const links: { href: string; label: string }[] = [];

  if (profile.website) {
    links.push({ href: profile.website, label: labelFor(profile.website, "Website") });
  }
  if (profile.linkedin) {
    links.push({ href: profile.linkedin, label: "LinkedIn" });
  }
  if (profile.github) {
    links.push({ href: profile.github, label: "GitHub" });
  }
  if (profile.x_url) {
    links.push({ href: profile.x_url, label: "X" });
  }

  const name = profile.full_name.trim() || "Portfolio";
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="max-w-sm">
          <p className="text-sm font-semibold">{name}</p>
          {profile.footer_note.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {profile.footer_note}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Curriculum vitae, projects and published work.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted hover:text-accent"
              >
                {link.label}
              </a>
            ))}
            {profile.email ? (
              <a href={`mailto:${profile.email}`} className="text-muted hover:text-accent">
                Email
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <Link href="/documents" className="hover:text-accent">
              Documents
            </Link>
            <span>© {year}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
