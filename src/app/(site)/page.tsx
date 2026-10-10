'use cache'

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";

import {
  AchievementList,
  CertificationList,
  EducationList,
  ExperienceList,
  ProjectGrid,
  SkillGrid,
} from "@/components/site/lists";
import { Description, EmptyState, ExternalLink, PageHeader, Pill, Section } from "@/components/site/ui";
import { CONTENT_TAG, getProfile, getPublished } from "@/lib/content";
import { excerpt } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfile();
  const name = profile.full_name.trim();
  const description =
    excerpt(profile.summary, 180) ||
    "Professional portfolio: experience, education, skills, projects, achievements, certifications and documents.";

  return {
    title: name ? { absolute: name } : undefined,
    description,
    openGraph: {
      title: name || undefined,
      description,
      type: "profile",
    },
  };
}

export default async function HomePage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");

  const [
    profile,
    experience,
    education,
    skills,
    projects,
    achievements,
    certifications,
  ] = await Promise.all([
    getProfile(),
    getPublished("experience"),
    getPublished("education"),
    getPublished("skills"),
    getPublished("projects"),
    getPublished("achievements"),
    getPublished("certifications"),
  ]);

  const name = profile.full_name.trim() || "Your name";
  const hasContent =
    experience.length + education.length + skills.length + projects.length > 0;

  return (
    <div className="space-y-16">
      {/* Hero ------------------------------------------------------ */}
      <section className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-start">
        {profile.avatar_id ? (
          <Image
            src={`/documents/${profile.avatar_id}`}
            alt={name}
            width={96}
            height={96}
            priority
            unoptimized
            className="h-24 w-24 rounded-2xl border border-border object-cover sm:h-28 sm:w-28"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-24 w-24 place-items-center rounded-2xl border border-border bg-surface text-2xl font-semibold sm:h-28 sm:w-28"
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}

        <div className="min-w-0">
          <p className="eyebrow mb-3">{profile.headline.trim() || "Curriculum vitae"}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            {profile.location.trim() ? <span>{profile.location}</span> : null}
            {profile.email.trim() ? (
              <a href={`mailto:${profile.email}`} className="hover:text-accent">
                {profile.email}
              </a>
            ) : null}
            {profile.website.trim() ? (
              <ExternalLink href={profile.website}>Website</ExternalLink>
            ) : null}
          </div>

          {profile.summary.trim() ? (
            <div className="mt-6 max-w-2xl text-[0.9375rem] leading-relaxed text-muted sm:text-base">
              <Description text={profile.summary} />
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/projects" className="btn btn-primary">
              View projects
            </Link>
            <Link href="/experience" className="btn btn-secondary">
              Work experience
            </Link>
            <Link href="/documents" className="btn btn-secondary">
              Documents
            </Link>
          </div>
        </div>
      </section>

      {!hasContent ? (
        <div className="card p-6">
          <p className="text-sm font-medium">Nothing has been published yet.</p>
          <p className="mt-1.5 text-sm text-muted">
            Sign in to the admin dashboard to add experience, education, skills, projects,
            achievements, certifications and documents.
          </p>
        </div>
      ) : null}

      {experience.length > 0 ? (
        <Section
          id="experience"
          title="Experience"
          kicker="Where I have worked"
          action={
            <Link href="/experience" className="text-sm text-accent hover:underline">
              All experience →
            </Link>
          }
        >
          <ExperienceList rows={experience.slice(0, 3)} />
        </Section>
      ) : null}

      {projects.length > 0 ? (
        <Section
          id="projects"
          title="Selected projects"
          kicker="Things I have built"
          action={
            <Link href="/projects" className="text-sm text-accent hover:underline">
              All projects →
            </Link>
          }
        >
          <ProjectGrid rows={projects.slice(0, 4)} />
        </Section>
      ) : null}

      {skills.length > 0 ? (
        <Section
          id="skills"
          title="Skills"
          kicker="What I work with"
          action={
            <Link href="/skills" className="text-sm text-accent hover:underline">
              All skills →
            </Link>
          }
        >
          <SkillGrid rows={skills.slice(0, 8)} />
        </Section>
      ) : null}

      {achievements.length > 0 || certifications.length > 0 ? (
        <Section id="credentials" title="Achievements & certifications" kicker="Published record">
          <div className="grid gap-10">
            {achievements.length > 0 ? (
              <div>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="eyebrow">Achievements</p>
                  <Link href="/achievements" className="text-sm text-accent hover:underline">
                    All →
                  </Link>
                </div>
                <AchievementList rows={achievements.slice(0, 3)} />
              </div>
            ) : null}
            {certifications.length > 0 ? (
              <div>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="eyebrow">Certifications</p>
                  <Link href="/certifications" className="text-sm text-accent hover:underline">
                    All →
                  </Link>
                </div>
                <CertificationList rows={certifications.slice(0, 3)} />
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {education.length > 0 ? (
        <Section
          id="education"
          title="Education"
          kicker="Academic background"
          action={
            <Link href="/education" className="text-sm text-accent hover:underline">
              All education →
            </Link>
          }
        >
          <EducationList rows={education.slice(0, 2)} />
        </Section>
      ) : null}

      <Section id="documents" title="Documents" kicker="Read or download">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">CV, certificates and published files</p>
            <p className="mt-1.5 text-sm text-muted">
              Every published document is available without signing in.
            </p>
          </div>
          <Link href="/documents" className="btn btn-primary shrink-0">
            Browse documents
          </Link>
        </div>
      </Section>

      {!hasContent ? (
        <EmptyState
          title="Your public pages are ready and waiting for content."
          hint="Each section stays hidden until at least one entry is published."
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Pill>Curriculum vitae</Pill>
        <Pill>Published work</Pill>
        <Pill>Projects</Pill>
      </div>
    </div>
  );
}
