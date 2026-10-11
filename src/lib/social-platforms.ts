/**
 * The professional platforms the owner can link to.
 *
 * Kept client-safe (no server-only imports) so the settings form, the footer
 * and the contact page can all read the same list.
 *
 * lucide-react dropped brand icons, so each platform maps to a generic glyph
 * and always renders its text label too — an icon is never the only cue.
 */

export type SocialPlatform = {
  /** Stable key stored in `social_links.platform`. */
  key: string;
  label: string;
  placeholder: string;
  /** lucide icon component name — resolved by `socialIcon()` in the UI layer. */
  icon: "globe" | "rss" | "mail" | "link";
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "linkedin", label: "LinkedIn", icon: "link",
    placeholder: "https://linkedin.com/in/you" },
  { key: "github", label: "GitHub", icon: "link",
    placeholder: "https://github.com/you" },
  { key: "x", label: "X (Twitter)", icon: "link", placeholder: "https://x.com/you" },
  { key: "youtube", label: "YouTube", icon: "link", placeholder: "https://youtube.com/@you" },
  { key: "instagram", label: "Instagram", icon: "link", placeholder: "https://instagram.com/you" },
  { key: "mastodon", label: "Mastodon", icon: "link", placeholder: "https://mastodon.social/@you" },
  { key: "bluesky", label: "Bluesky", icon: "link", placeholder: "https://bsky.app/profile/you" },
  { key: "medium", label: "Medium", icon: "rss", placeholder: "https://medium.com/@you" },
  { key: "blog", label: "Blog / RSS", icon: "rss", placeholder: "https://example.com/feed.xml" },
  { key: "orcid", label: "ORCID", icon: "link", placeholder: "https://orcid.org/0000-0000-0000-0000" },
  { key: "scholar", label: "Google Scholar", icon: "link",
    placeholder: "https://scholar.google.com/citations?user=…" },
  { key: "email", label: "Email", icon: "mail", placeholder: "you@example.com" },
];

export function platformMeta(key: string): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find((platform) => platform.key === key);
}

export function platformLabel(key: string): string {
  return platformMeta(key)?.label ?? key;
}
