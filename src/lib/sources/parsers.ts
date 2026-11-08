import { load } from "cheerio";
import { z } from "zod";
import {
  canonicalUrl,
  competitionSchema,
  deadlineTime,
  type Competition,
  type SourceId,
} from "../model";
import { competitionImageUrl, kagglePreviewPrefix } from "../competition-images";

function sourceImage(value: unknown, base: string, kind: "cover" | "logo" = "cover") {
  const url = competitionImageUrl(value, base);
  return url ? { url, kind } : null;
}

export function text(value: string) {
  const $ = load(value);
  $("script, style").remove();
  return $.text().replace(/\s+/g, " ").trim();
}
export function iso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // Only accept explicit timestamps, not ambiguous locale-formatted dates.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + "Z";
  const millis = Date.parse(withZone);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}
function url(value: string, base: string) {
  const parsed = new URL(value, base);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("Invalid source URL");
  return parsed.toString();
}
function base(source: SourceId, id: string | number, checkedAt: string): Competition {
  return {
    id: `${source}:${id}`,
    source,
    title: "",
    url: "https://example.invalid",
    description: "",
    category: "ML / Data science",
    tags: [],
    organizer: "",
    reward: null,
    opensAt: null,
    registrationEndsAt: null,
    submissionEndsAt: null,
    challengeEndsAt: null,
    eventEndsAt: null,
    registrationOpen: null,
    participation: "Check format",
    location: "Check organizer rules",
    entryFee: "Unknown",
    eligibility: "Eligibility for Indonesia is unverified. Check the organizer's rules.",
    lastSeenAt: checkedAt,
  };
}

const evalRow = z.object({
  id: z.number(),
  title: z.string(),
  short_description: z.string().nullish(),
  description: z.string().nullish(),
  image: z.unknown().optional(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  list_tags: z.array(z.string()).nullish(),
  creator: z.object({ team_name: z.string().optional() }).nullish(),
  is_registration_open: z.boolean().nullish(),
  allowed_email_domains: z.array(z.string()).optional(),
  manual_participant_approval: z.boolean().optional(),
});
export const evalPage = z.object({
  results: z.array(evalRow),
  next: z.string().nullable(),
  count: z.number(),
});
export function parseEvalAI(data: unknown, checkedAt: string) {
  const page = evalPage.parse(data);
  return {
    next: page.next,
    items: page.results.map((item) =>
      competitionSchema.parse({
        ...base("evalai", item.id, checkedAt),
        title: text(item.title),
        url: `https://eval.ai/web/challenges/challenge-page/${item.id}/overview`,
        description: text(
          [item.short_description, item.description].filter(Boolean).join(" ") ||
            "Research challenge hosted on EvalAI.",
        ).slice(0, 2000),
        image: sourceImage(item.image, "https://media.eval.ai", "logo"),
        category: "Research challenge",
        tags: (item.list_tags ?? []).slice(0, 40).map((tag) => tag.slice(0, 100)),
        organizer: item.creator?.team_name ?? "EvalAI challenge organizers",
        opensAt: iso(item.start_date),
        challengeEndsAt: iso(item.end_date),
        registrationOpen: item.is_registration_open ?? null,
        participation: "Online",
        location: "Online submissions; finals vary",
        eligibility: item.allowed_email_domains?.length
          ? "Restricted email domains. Check whether your student email qualifies."
          : item.manual_participant_approval
            ? "Organizer approval required. Country eligibility is unverified."
            : base("evalai", item.id, checkedAt).eligibility,
      }),
    ),
  };
}

function kaggleUrl(ref: string) {
  const value = /^[a-z0-9-]+$/i.test(ref) ? `/competitions/${ref}` : ref;
  const parsed = new URL(url(value, "https://www.kaggle.com"));
  const match = parsed.pathname.match(/^\/(?:competitions|c)\/([a-z0-9-]+)\/?$/i);
  if (!["https://www.kaggle.com", "https://kaggle.com"].includes(parsed.origin) || !match)
    throw new Error("Invalid Kaggle competition URL");
  return `https://www.kaggle.com/competitions/${match[1]}`;
}

const kaggleRow = z.object({
  id: z.number().int().positive().nullish().catch(null),
  ref: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  deadline: z.string().nullish(),
  category: z.string().nullish(),
  reward: z.union([z.string(), z.number()]).nullish(),
  imageUrl: z.unknown().optional(),
  thumbnailImageUrl: z.unknown().optional(),
  tags: z.array(z.object({ name: z.string() })).optional(),
});
export function parseKaggle(data: unknown, checkedAt: string) {
  return z
    .array(kaggleRow)
    .parse(data)
    .map((item) =>
      competitionSchema.parse({
        ...base("kaggle", item.ref, checkedAt),
        title: text(item.title),
        url: kaggleUrl(item.ref),
        description: text(item.description ?? "Machine learning competition on Kaggle.").slice(
          0,
          700,
        ),
        tags: [
          ...(item.tags ?? []).map((tag) => tag.name),
          ...(item.category ? [item.category] : []),
        ].slice(0, 40),
        organizer: "Kaggle",
        image:
          sourceImage(item.thumbnailImageUrl, "https://www.kaggle.com", "logo") ??
          sourceImage(item.imageUrl, "https://www.kaggle.com", "logo") ??
          (item.id
            ? sourceImage(`${kagglePreviewPrefix}${item.id}`, "https://www.kaggle.com")
            : null),
        reward: item.reward ? text(String(item.reward)) : null,
        submissionEndsAt: iso(item.deadline),
        participation: "Online",
        location: "Online submissions; finals vary",
      }),
    );
}

export function parseDrivenDeadline(value: string) {
  const match = value.match(
    /([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s+UTC/i,
  );
  if (!match) return null;
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month = months.indexOf(match[1].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const hour = (Number(match[4]) % 12) + (match[6].toLowerCase() === "p" ? 12 : 0);
  return new Date(
    Date.UTC(Number(match[3]), month, Number(match[2]), hour, Number(match[5] ?? 0)),
  ).toISOString();
}
export function parseDrivenData(html: string, checkedAt: string) {
  const $ = load(html);
  const cards = $(".panel-container");
  if (!cards.length) throw new Error("DrivenData listing structure changed");
  const items: Competition[] = [];
  cards.filter(".active-comp").each((_, element) => {
    const card = $(element);
    const link = card.find(".panel-competition-title a");
    const href = link.attr("href");
    if (!href) return;
    const destination = url(href, "https://www.drivendata.org");
    const tags = card
      .find("a[href*='category='], .d-none a")
      .map((_, tag) => $(tag).text().replace(/^#/, "").trim())
      .get();
    const description = card
      .find(".panel-description, .panel-body p, p")
      .map((_, p) => $(p).text().trim())
      .get()
      .filter((p) => p.length > 50)[0];
    const reward = Number(card.attr("data-total_prize_purse"));
    const imageStyle = card.find("a.image").attr("style") ?? "";
    const cover = imageStyle.match(/background-image:\s*url\(\s*['"]?([^'"\)]+)['"]?\s*\)/i)?.[1];
    const image =
      sourceImage(cover, "https://www.drivendata.org") ??
      sourceImage(card.find(".panel-logo img").attr("src"), "https://www.drivendata.org", "logo");
    items.push(
      competitionSchema.parse({
        ...base("drivendata", destination, checkedAt),
        title: link.text().trim(),
        url: destination,
        image,
        description: (
          description ??
          "A data science challenge on DrivenData. See the official page for the task and participation rules."
        ).slice(0, 700),
        tags: [...new Set(tags)].slice(0, 40),
        organizer: "DrivenData",
        reward:
          reward > 0
            ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(reward)
            : null,
        challengeEndsAt: parseDrivenDeadline(card.find(".end-date").attr("title") ?? ""),
        participation: "Online",
        location: "Online submissions; finals vary",
      }),
    );
  });
  return items;
}

const mlhEvent = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  url: z.string(),
  websiteUrl: z.string().nullish(),
  formatType: z.string(),
  location: z.string(),
  organizationName: z.string().nullish(),
  backgroundUrl: z.unknown().optional(),
  logoUrl: z.unknown().optional(),
  customFields: z.object({ hackathon_focus: z.array(z.string()).optional() }).optional(),
});
export function parseMLH(html: string, checkedAt: string) {
  const $ = load(html);
  const json = $("script[data-page='app'][type='application/json']").text();
  if (!json) throw new Error("MLH listing structure changed");
  const page = z
    .object({ props: z.object({ upcomingEvents: z.array(mlhEvent) }) })
    .parse(JSON.parse(json));
  return page.props.upcomingEvents.map((item) =>
    competitionSchema.parse({
      ...base("mlh", item.id, checkedAt),
      title: text(item.name),
      url: url(item.url, "https://www.mlh.com"),
      description: `Build a project at ${text(item.name)}. ${item.formatType === "digital" ? "An online hackathon" : `Hosted in ${text(item.location)}`} in the MLH season. Registration cutoffs and country eligibility must be checked with the organizer.`,
      image:
        sourceImage(item.backgroundUrl, "https://www.mlh.com") ??
        sourceImage(item.logoUrl, "https://www.mlh.com", "logo"),
      category: "Hackathon",
      tags: (item.customFields?.hackathon_focus ?? []).slice(0, 40),
      organizer: item.organizationName ?? "MLH community",
      opensAt: iso(item.startsAt),
      eventEndsAt: iso(item.endsAt),
      participation:
        item.formatType === "digital"
          ? "Online"
          : item.formatType === "physical"
            ? "In person"
            : "Check format",
      location: text(item.location),
    }),
  );
}

export function parseCodabenchPage(data: unknown) {
  return z
    .object({
      count: z.number().int().nonnegative(),
      next: z.string().nullable(),
      results: z.array(z.object({ id: z.number().int().positive() })),
    })
    .parse(data);
}

export function parseCodabenchCompetition(data: unknown, checkedAt: string): Competition | null {
  const item = z
    .object({
      id: z.number().int().positive(),
      title: z.string(),
      published: z.boolean(),
      created_by: z.string().nullish(),
      owner_display_name: z.string().nullish(),
      description: z.string().nullish(),
      reward: z.string().nullish(),
      logo: z.unknown().optional(),
      competition_type: z.string().optional(),
      registration_auto_approve: z.boolean().nullish(),
      phases: z.array(z.object({ start: z.string(), end: z.string().nullable() })),
    })
    .parse(data);
  if (!item.published || !item.phases.length) return null;
  const phases = item.phases.map((phase) => {
    const start = iso(phase.start);
    const end = phase.end === null ? null : iso(phase.end);
    if (!start || (phase.end !== null && !end)) throw new Error("Invalid Codabench phase date");
    return { start, end };
  });
  if (!phases.some((phase) => !phase.end || Date.parse(phase.end) > Date.parse(checkedAt)))
    return null;
  let image = null;
  if (typeof item.logo === "string") {
    try {
      const asset = new URL(item.logo);
      // This bucket is publicly readable without signing. Never store expiring CDN credentials.
      if (
        asset.origin === "https://miniodis-rproxy.lisn.upsaclay.fr" &&
        asset.pathname.startsWith("/coda-v2-prod-public/logos/")
      ) {
        asset.search = "";
        image = sourceImage(asset.toString(), "https://www.codabench.org", "logo");
      }
    } catch {
      /* An invalid optional image must not hide the competition. */
    }
  }
  return competitionSchema.parse({
    ...base("codabench", item.id, checkedAt),
    title: text(item.title),
    url: `https://www.codabench.org/competitions/${item.id}/`,
    description: text(item.description ?? "A public Codabench research challenge.").slice(0, 1800),
    image,
    category: "Research challenge",
    tags: item.competition_type ? [item.competition_type] : [],
    organizer: text(item.owner_display_name || item.created_by || "Codabench organizers"),
    reward: item.reward ? text(item.reward) : null,
    opensAt: phases.map((phase) => phase.start).sort()[0],
    challengeEndsAt: phases.some((phase) => !phase.end)
      ? null
      : phases
          .map((phase) => phase.end!)
          .sort()
          .at(-1),
    participation: "Online",
    location: "Online submissions; finals vary",
    eligibility: `${item.registration_auto_approve === false ? "Organizer approval required. " : ""}Eligibility for Indonesia is unverified. Submission windows vary by phase; check the official timeline.`,
  });
}

function calendarDate(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!match) return null;
  const month =
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      match[2].toLowerCase(),
    ) + 1;
  if (!month) return null;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return z.iso.date().safeParse(date).success ? date : null;
}

export function parseOpenCalendar(
  data: unknown,
  checkedAt: string,
  platform: "zindi" | "codabench" | "devpost",
) {
  const raw = z.object({ data: z.array(z.unknown()) }).parse(data);
  const selected = raw.data.filter(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "platform" in row &&
      typeof row.platform === "string" &&
      row.platform.toLowerCase() === platform,
  );
  const entries = z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        tags: z.array(z.string()).nullish(),
        launched: z.string().nullish(),
        deadline: z.string(),
        "registration-deadline": z.string().nullish(),
        sponsor: z.string().nullish(),
        prize: z.string().nullish(),
        note: z.string().nullish(),
        "additional-urls": z.array(z.string()).optional(),
      }),
    )
    .parse(selected);
  const candidates = new Set<number>();
  const items = entries.flatMap((item) => {
    const deadline = calendarDate(item.deadline);
    if (!deadline) throw new Error("Invalid calendar submission date");
    if (deadlineTime(deadline) <= Date.parse(checkedAt)) return [];
    const destination = new URL(item.url);
    const zindi = platform === "zindi";
    const codabench = platform === "codabench";
    const zindiOrigins = [
      "https://zindi.africa",
      "https://zindi.world",
      "https://www.zindi.africa",
      "https://www.zindi.world",
    ];
    const codabenchOrigins = ["https://www.codabench.org", "https://codabench.org"];
    const match = destination.pathname.match(
      zindi ? /^\/competitions\/([a-z0-9-]+)(?:\/leaderboard)?\/?$/i : /^\/competitions\/(\d+)\/?$/,
    )?.[1];
    if (
      destination.protocol !== "https:" ||
      destination.username ||
      destination.password ||
      (zindi && (!match || !zindiOrigins.includes(destination.origin)))
    )
      throw new Error("Unexpected calendar competition URL");
    const numericId =
      codabench && codabenchOrigins.includes(destination.origin) && match ? Number(match) : null;
    if (codabench)
      for (const link of [item.url, ...(item["additional-urls"] ?? [])]) {
        try {
          const related = new URL(link);
          const id = Number(related.pathname.match(/^\/competitions\/(\d+)\/?$/)?.[1]);
          if (
            codabenchOrigins.includes(related.origin) &&
            !related.username &&
            !related.password &&
            Number.isSafeInteger(id) &&
            id > 0
          )
            candidates.add(id);
        } catch {
          /* Additional links can refer to non-API resources. */
        }
      }
    const identifier = zindi ? match! : (numericId ?? canonicalUrl(destination.toString()));
    const name = zindi ? "Zindi" : codabench ? "Codabench" : "Devpost";
    return [
      competitionSchema.parse({
        ...base(platform, identifier, checkedAt),
        title: text(item.name),
        url: zindi
          ? `https://zindi.world/competitions/${identifier}`
          : numericId
            ? `https://www.codabench.org/competitions/${numericId}/`
            : destination.toString(),
        description: text(
          `Listed in MLContests' open competition calendar. ${item.note ?? `Verify current rules and eligibility on ${name}.`}`,
        ).slice(0, 1200),
        category:
          platform === "devpost" || item.tags?.includes("hackathon")
            ? "Hackathon"
            : zindi
              ? "ML / Data science"
              : "Research challenge",
        tags: (item.tags ?? []).slice(0, 40).map((tag) => tag.slice(0, 100)),
        organizer: text(item.sponsor || `${name} competition organizers`),
        reward: item.prize ? text(item.prize) : null,
        opensAt: calendarDate(item.launched),
        registrationEndsAt: calendarDate(item["registration-deadline"]),
        submissionEndsAt: deadline,
        participation: item.tags?.includes("in-person") ? "In person" : "Online",
        location: item.tags?.includes("in-person")
          ? "Check the organizer's venue"
          : "Online submissions; finals vary",
      }),
    ];
  });
  return { items, candidates: [...candidates] };
}

export function parseZindiCalendar(data: unknown, checkedAt: string) {
  return parseOpenCalendar(data, checkedAt, "zindi").items;
}

export const zindiCardSelector =
  "[class^='Competition__container'], [class*=' Competition__container']";

export function parseZindiDirectory(html: string, checkedAt: string) {
  const $ = load(html);
  $("script, style, iframe, form").remove();
  let expected: number | null = null;
  let open = false;
  const items = new Map<string, Competition>();
  $(`h2, ${zindiCardSelector}`).each((_, element) => {
    const node = $(element);
    if (node.is("h2")) {
      const heading = node.text().replace(/\s+/g, " ").trim();
      const count = heading.match(/^Open Challenges:\s*(\d+)$/i);
      if (count) {
        expected = Number(count[1]);
        open = true;
      } else if (/^Past Challenges:/i.test(heading)) open = false;
      return;
    }
    if (!open) return;
    const link = node.find("[class*='Competition__title'] a[href]").first();
    const href = link.attr("href");
    if (!href) throw new Error("Zindi competition link missing");
    const destination = new URL(url(href, "https://zindi.world"));
    const slug = destination.pathname.match(/^\/competitions\/([a-z0-9-]+)\/?$/i)?.[1];
    if (!slug || destination.origin !== "https://zindi.world")
      throw new Error("Unexpected Zindi competition URL");
    const item = competitionSchema.parse({
      ...base("zindi", slug, checkedAt),
      title: link.text().replace(/\s+/g, " ").trim().slice(0, 500),
      url: `https://zindi.world/competitions/${slug}`,
      description:
        "Public Zindi challenge. Check the official page for task details and participation rules.",
      organizer: "Zindi competition organizers",
      image: null,
      reward:
        node.find("[class*='Competition__reward']").first().text().replace(/\s+/g, " ").trim() ||
        null,
    });
    items.set(item.id, item);
  });
  if (expected === null) throw new Error("Zindi directory structure changed");
  return { items: [...items.values()], expected, complete: items.size === expected };
}

function zindiDate(value: string) {
  const raw = value.replace(/\s+/g, " ").trim();
  if (z.iso.datetime({ offset: true }).safeParse(raw).success) return iso(raw);
  if (z.iso.date().safeParse(raw).success) return raw;
  // Zindi's public timeline renders years as YY (the platform launched in 2018).
  const match = raw.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2}|\d{4})$/);
  return match
    ? calendarDate(`${match[1]} ${match[2]} ${match[3].length === 2 ? "20" : ""}${match[3]}`)
    : null;
}

export function parseZindiTimeline(html: string) {
  const $ = load(html);
  $("script, style, iframe, form").remove();
  if (!$("[class*='Timeline__container']").length)
    throw new Error("Zindi timeline structure changed");
  const dates: Pick<
    Competition,
    "opensAt" | "registrationEndsAt" | "submissionEndsAt" | "challengeEndsAt" | "eventEndsAt"
  > = {
    opensAt: null,
    registrationEndsAt: null,
    submissionEndsAt: null,
    challengeEndsAt: null,
    eventEndsAt: null,
  };
  const fields: Record<string, keyof typeof dates> = {
    start: "opensAt",
    close: "challengeEndsAt",
    "registration deadline": "registrationEndsAt",
    "submission deadline": "submissionEndsAt",
    "event end": "eventEndsAt",
  };
  let recognized = 0;
  $("[class*='Timeline__child']").each((_, element) => {
    const row = $(element);
    const label = row.find("[class*='Timeline__title']").clone();
    label.find("[class*='Timeline__info']").remove();
    const field = fields[label.text().trim().toLowerCase()];
    if (!field) return; // Results reveal is not an event or submission deadline.
    recognized++;
    const cell = row.find("[class*='Timeline__date']");
    const raw = cell.find("[datetime]").attr("datetime") ?? cell.text().trim();
    if (!raw || /^(?:-|unlisted|ongoing|tba)$/i.test(raw)) return;
    const parsed = zindiDate(raw);
    if (!parsed) throw new Error("Invalid Zindi timeline date");
    dates[field] = parsed;
  });
  if (!recognized) throw new Error("Zindi timeline labels changed");
  const tooltip = $("[class*='tooltip'], [role='tooltip']").text();
  const submission = tooltip.match(/Submission close\s*=\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i);
  if (submission) {
    const day = calendarDate(`${submission[1]} ${submission[2].slice(0, 3)} ${submission[3]}`);
    if (!day) throw new Error("Invalid Zindi submission date");
    // The public popover clarifies Close as a submission/selection window, not challenge end.
    // Its visible clock has no timezone, so retain only its explicitly published calendar day.
    dates.submissionEndsAt = day;
    dates.challengeEndsAt = null;
  }
  return dates;
}

export function parseAIcrowd(html: string, checkedAt: string) {
  const $ = load(html);
  if (!$("#challenges-div").length) throw new Error("AIcrowd listing structure changed");
  const items: Competition[] = [];
  const cards = $(".card-challenge");
  cards.each((_, element) => {
    const card = $(element);
    const badge = card.find(".card-img-overlay .badge").text();
    if (/completed|ended|closed|draft/i.test(badge)) return;
    const upcoming = /starting soon/i.test(badge);
    const link = card.find(".card-title a");
    const href = link.attr("href");
    if (!href) return;
    const destination = url(href, "https://www.aicrowd.com");
    items.push(
      competitionSchema.parse({
        ...base("aicrowd", destination.split("/").at(-1) ?? destination, checkedAt),
        title: text(link.text()),
        url: destination,
        description: (
          text(card.find(".card-text").text()) ||
          (upcoming
            ? "Starting soon on AIcrowd. Check the official page for the opening date and participation rules."
            : "An AIcrowd challenge. Check the official page for current rounds and participation rules.")
        ).slice(0, 700),
        image: sourceImage(
          card.find(".image-wrapper img.card-img").first().attr("src"),
          "https://www.aicrowd.com",
        ),
        category: "Research challenge",
        tags: [
          ...card
            .find(".category-group .badge")
            .map((_, node) => $(node).text().trim().replace(/^#/, "").replaceAll("_", " "))
            .get(),
          ...(upcoming ? ["upcoming"] : []),
        ].slice(0, 40),
        organizer: card.find(".card-footer span").text().trim() || "AIcrowd community",
        reward: text(card.find(".prize-item-cash").text()) || null,
        participation: "Online",
        location: "Online submissions; finals vary",
      }),
    );
  });
  return { items, empty: cards.length === 0 };
}
