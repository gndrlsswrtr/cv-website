import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Description, ExternalLink, PageHeader, Pill } from "@/components/site/ui";
import { getPublishedProject } from "@/lib/content";
import { excerpt } from "@/lib/format";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublishedProject(slug);
  if (!project) return { title: "Project not found" };

  const title = String(project.title ?? "Project");
  const description =
    excerpt(String(project.summary ?? ""), 160) || `Project: ${title}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
  };
}

/**
 * `params` only resolves at request time, so the body streams behind a
 * boundary. The data itself still comes from a cached, tagged getter.
 */
export default function ProjectPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div>
          <p className="eyebrow mb-3">
            <Link href="/projects" className="hover:text-accent">
              ← Projects
            </Link>
          </p>
          <div className="h-8 w-64 animate-pulse rounded bg-border" />
          <div className="mt-6 h-4 w-full max-w-3xl animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-2/3 max-w-3xl animate-pulse rounded bg-border" />
        </div>
      }
    >
      <ProjectDetail params={params} />
    </Suspense>
  );
}

async function ProjectDetail({ params }: PageProps) {
  const { slug } = await params;
  const project = await getPublishedProject(slug);
  if (!project) notFound();

  const tech = String(project.tech ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const links: { href: string; label: string }[] = [];
  if (String(project.repo_url ?? "")) {
    links.push({ href: String(project.repo_url), label: "Source code" });
  }
  if (String(project.demo_url ?? "")) {
    links.push({ href: String(project.demo_url), label: "Live demo" });
  }

  return (
    <article>
      <p className="eyebrow mb-3">
        <Link href="/projects" className="hover:text-accent">
          ← Projects
        </Link>
      </p>

      <PageHeader eyebrow="Selected work" title={String(project.title ?? "Project")} />

      {String(project.summary ?? "") ? (
        <p className="max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
          {String(project.summary)}
        </p>
      ) : null}

      {tech.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {tech.map((item) => (
            <Pill key={item}>{item}</Pill>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-5 border-y border-border py-4 text-sm">
          {links.map((link) => (
            <ExternalLink key={link.href} href={link.href}>
              {link.label}
            </ExternalLink>
          ))}
        </div>
      ) : null}

      {String(project.description ?? "") ? (
        <div className="mt-8 max-w-3xl text-[0.9375rem] leading-relaxed text-muted sm:text-base">
          <Description text={String(project.description)} />
        </div>
      ) : null}
    </article>
  );
}
