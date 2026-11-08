// Shared by source parsing and Next's image optimizer. Never proxy arbitrary URLs.
export const kagglePreviewPrefix = "https://www.kaggle.com/open-graph/images/Competitions/";

export const competitionImagePatterns = [
  {
    protocol: "https",
    hostname: "zindi-public-release.s3.eu-west-2.amazonaws.com",
    port: "",
    pathname: "/uploads/competition/image/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "media.eval.ai",
    port: "",
    pathname: "/media/logos/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "drivendata-prod-public.s3.amazonaws.com",
    port: "",
    pathname: "/comp_images/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "drivendata-prod-public.s3.amazonaws.com",
    port: "",
    pathname: "/hosts/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "images.aicrowd.com",
    port: "",
    pathname: "/images/challenges/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "www.aicrowd.com",
    port: "",
    pathname: "/assets/challenges/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "miniodis-rproxy.lisn.upsaclay.fr",
    port: "",
    pathname: "/coda-v2-prod-public/logos/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "mlhusercontent.com",
    port: "",
    pathname: "/backgrounds/events/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "mlhusercontent.com",
    port: "",
    pathname: "/logos/events/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "www.kaggle.com",
    port: "",
    pathname: "/open-graph/images/Competitions/**",
    search: "",
  },
  {
    protocol: "https",
    hostname: "storage.googleapis.com",
    port: "",
    pathname: "/kaggle-competitions/**",
    search: "",
  },
] as const;

export function competitionImageUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      /\.svg$/i.test(url.pathname)
    )
      return null;
    if (
      url.hostname === "www.kaggle.com" &&
      !/^\/open-graph\/images\/Competitions\/[1-9]\d*$/.test(url.pathname)
    )
      return null;
    const allowed = competitionImagePatterns.some(
      (pattern) =>
        url.hostname === pattern.hostname &&
        url.pathname.startsWith(pattern.pathname.replace(/\*\*$/, "")),
    );
    if (!allowed) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
