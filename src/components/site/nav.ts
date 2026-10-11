export type NavItem = { href: string; label: string };

/**
 * Public navigation.
 *
 * Kept deliberately short — this is a CV, not a sitemap — and ordered the way a
 * reader triages a candidate: what they do, where they studied, what they know,
 * what they have shipped, what they have been recognised for, then the files.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/about", label: "About" },
  { href: "/experience", label: "Experience" },
  { href: "/volunteer", label: "Volunteering" },
  { href: "/education", label: "Education" },
  { href: "/skills", label: "Skills" },
  { href: "/projects", label: "Projects" },
  { href: "/achievements", label: "Achievements" },
  { href: "/certifications", label: "Certifications" },
  { href: "/documents", label: "Documents" },
  { href: "/contact", label: "Contact" },
];
