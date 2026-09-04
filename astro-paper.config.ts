import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://www.gregbigelow.com/",
    title: "Greg Bigelow",
    description:
      "Personal site of Greg Bigelow — exploring the world, myself, and what it means to live a full human life.",
    author: "Greg Bigelow",
    timezone: "America/New_York",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: false,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: false,
  },
  socials: [
    { name: "github", url: "https://github.com/gregab" },
    // Cloudflare Email Routing alias on this domain, forwarding to Greg's
    // inbox. Never put a personal address here.
    { name: "mail", url: "mailto:hello@gregbigelow.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
