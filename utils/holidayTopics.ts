/**
 * Seasonal crochet scrape windows and YouTube search queries.
 * Used by scripts/update-patterns.ts to pull timely tutorials (e.g. Halloween in October).
 */

export type HolidayTopicId =
  | 'valentines'
  | 'stpatricks'
  | 'easter'
  | 'mothers-day'
  | 'halloween'
  | 'thanksgiving'
  | 'christmas'
  | 'winter';

export type HolidayTopic = {
  id: HolidayTopicId;
  /** Primary tag stored on scraped patterns */
  tag: string;
  keywords: readonly string[];
  searchQuery: string;
  isActive: (date: Date) => boolean;
  /** When multiple windows overlap, higher priority wins */
  priority: number;
};

/** Local calendar date — matches what users see in the Patterns tab season chips. */
function localMonthDay(date: Date): { month: number; day: number } {
  return { month: date.getMonth() + 1, day: date.getDate() };
}

function inRange(
  date: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): boolean {
  const { month, day } = localMonthDay(date);
  const value = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  return value >= start && value <= end;
}

export const HOLIDAY_TOPICS: readonly HolidayTopic[] = [
  {
    id: 'winter',
    tag: 'winter',
    keywords: ['winter', 'snowflake', 'snowman', 'new year', 'cozy'],
    searchQuery:
      '("crochet winter" | "crochet snowflake" | "crochet snowman") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 1, 1, 1, 14),
    priority: 2,
  },
  {
    id: 'valentines',
    tag: 'valentines',
    keywords: ['valentine', 'valentines', 'heart', 'love', 'february', 'romantic'],
    searchQuery:
      '("crochet valentine" | "crochet heart") ("tutorial" | "pattern" | "gift") -shorts',
    isActive: (date) => inRange(date, 2, 1, 2, 14),
    priority: 5,
  },
  {
    id: 'stpatricks',
    tag: 'stpatricks',
    keywords: ['st patrick', 'st. patrick', 'shamrock', 'irish', 'green', 'march'],
    searchQuery:
      '("crochet shamrock" | "crochet st patrick") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 3, 1, 3, 17),
    priority: 5,
  },
  {
    id: 'easter',
    tag: 'easter',
    keywords: ['easter', 'bunny', 'rabbit', 'egg', 'spring chick'],
    searchQuery:
      '("crochet easter" | "crochet bunny" | "crochet egg") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 3, 15, 4, 25),
    priority: 4,
  },
  {
    id: 'mothers-day',
    tag: 'mothers-day',
    keywords: ['mother', "mother's day", 'mothers day', 'mom', 'may'],
    searchQuery:
      '("crochet mothers day" | "crochet gift for mom") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 4, 25, 5, 15),
    priority: 4,
  },
  {
    id: 'halloween',
    tag: 'halloween',
    keywords: [
      'halloween',
      'pumpkin',
      'spooky',
      'ghost',
      'bat',
      'witch',
      'skull',
      'spider',
      'autumn',
      'october',
    ],
    searchQuery:
      '("crochet halloween" | "crochet pumpkin" | "crochet ghost" | "crochet spooky") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 9, 15, 10, 31),
    priority: 6,
  },
  {
    id: 'thanksgiving',
    tag: 'thanksgiving',
    keywords: ['thanksgiving', 'turkey', 'harvest', 'fall', 'autumn', 'november', 'pie'],
    searchQuery:
      '("crochet thanksgiving" | "crochet turkey" | "crochet fall decor") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 11, 1, 11, 28),
    priority: 5,
  },
  {
    id: 'christmas',
    tag: 'christmas',
    keywords: [
      'christmas',
      'xmas',
      'santa',
      'reindeer',
      'ornament',
      'holiday',
      'wreath',
      'stocking',
      'december',
    ],
    searchQuery:
      '("crochet christmas" | "crochet ornament" | "crochet santa" | "crochet stocking") ("tutorial" | "pattern") -shorts',
    isActive: (date) => inRange(date, 11, 15, 12, 31),
    priority: 7,
  },
];

const HOLIDAY_BY_ID = new Map(HOLIDAY_TOPICS.map((topic) => [topic.id, topic]));

export function getHolidayTopic(id: string): HolidayTopic | undefined {
  return HOLIDAY_BY_ID.get(id as HolidayTopicId);
}

/** All holiday windows active on this calendar day, highest priority first. */
export function getActiveHolidayTopics(date = new Date()): HolidayTopic[] {
  return HOLIDAY_TOPICS.filter((topic) => topic.isActive(date)).sort((a, b) => b.priority - a.priority);
}

/** Primary active holiday (highest priority), if any. */
export function getActiveHolidayTopic(date = new Date()): HolidayTopic | undefined {
  return getActiveHolidayTopics(date)[0];
}

export const HOLIDAY_CHIP_LABELS: Record<HolidayTopicId, string> = {
  winter: '❄️ Winter',
  valentines: "💕 Valentine's",
  stpatricks: "☘️ St. Patrick's",
  easter: '🐣 Easter',
  'mothers-day': "🌷 Mother's Day",
  halloween: '🎃 Halloween',
  thanksgiving: '🦃 Thanksgiving',
  christmas: '🎄 Christmas',
};

const HOLIDAY_DISPLAY_NAMES: Record<HolidayTopicId, string> = {
  winter: 'Winter',
  valentines: "Valentine's",
  stpatricks: "St. Patrick's",
  easter: 'Easter',
  'mothers-day': "Mother's Day",
  halloween: 'Halloween',
  thanksgiving: 'Thanksgiving',
  christmas: 'Christmas',
};

export function isHolidayTopicId(value: string): value is HolidayTopicId {
  return HOLIDAY_BY_ID.has(value as HolidayTopicId);
}

export function holidayChipLabel(id: HolidayTopicId): string {
  return HOLIDAY_CHIP_LABELS[id];
}

export function holidayEmptyState(id: HolidayTopicId): { title: string; body: string } {
  const name = HOLIDAY_DISPLAY_NAMES[id];
  const tag = getHolidayTopic(id)?.tag ?? id;
  return {
    title: `No ${name} patterns yet`,
    body: `Save a tutorial with + and tag it ${tag}.`,
  };
}

/** Category tag keywords for mergePattern / feed filters (includes non-holiday buckets). */
export function scrapeCategoryKeywords(): Record<string, readonly string[]> {
  const fromHolidays: Record<string, readonly string[]> = {};
  for (const topic of HOLIDAY_TOPICS) {
    fromHolidays[topic.tag] = topic.keywords;
  }
  return {
    ...fromHolidays,
    amigurumi: ['amigurumi', 'plush', 'plushie', 'doll', 'stuffie', 'toy'],
    wearables: [
      'wearable',
      'wearables',
      'cardigan',
      'sweater',
      'jumper',
      'pullover',
      'hat',
      'beanie',
      'scarf',
      'shawl',
      'duster',
      'sock',
      'glove',
      'mitten',
      'cowl',
      'vest',
      'hoodie',
      'dress',
    ],
    blankets: ['blanket', 'blankets', 'afghan', 'throw'],
    bag: ['bag', 'tote', 'purse', 'pouch'],
  };
}

/** GitHub Actions `pattern-scraper.yml` topic dropdown — keep in sync. */
export const WORKFLOW_SCRAPE_TOPIC_OPTIONS = [
  'trending',
  'seasonal',
  'halloween',
  'christmas',
  'thanksgiving',
  'valentines',
  'easter',
  'stpatricks',
  'amigurumi',
  'wearables',
  'blankets',
] as const;

export type WorkflowScrapeTopicOption = (typeof WORKFLOW_SCRAPE_TOPIC_OPTIONS)[number];

const WORKFLOW_SCRAPE_TOPIC_SET = new Set<string>(WORKFLOW_SCRAPE_TOPIC_OPTIONS);

export function isWorkflowScrapeTopic(value: string): value is WorkflowScrapeTopicOption {
  return WORKFLOW_SCRAPE_TOPIC_SET.has(value.trim().toLowerCase());
}

/** Manual workflow picks (not trending/seasonal) always scrape that bucket, even off-season. */
export function isExplicitManualScrapeTopic(topic: string): boolean {
  const normalized = topic.trim().toLowerCase();
  if (normalized === 'trending' || normalized === 'seasonal') return false;
  if (getHolidayTopic(normalized)) return true;
  return normalized === 'amigurumi' || normalized === 'wearables' || normalized === 'blankets';
}

/** Tag stamped on scraped patterns so holiday/category filters match the workflow topic. */
export function primaryTagForScrapeTopic(resolvedTopic: string): string | undefined {
  const topic = resolvedTopic.trim().toLowerCase();
  if (!topic || topic === 'trending') return undefined;
  const holiday = getHolidayTopic(topic);
  if (holiday) return holiday.tag;
  if (topic === 'amigurumi' || topic === 'wearables' || topic === 'blankets') return topic;
  return undefined;
}

export function applyPrimaryScrapeTopicTag(tags: readonly string[], resolvedTopic: string): string[] {
  const primary = primaryTagForScrapeTopic(resolvedTopic);
  if (!primary) return [...tags];
  const normalized = primary.toLowerCase();
  const next = tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (!next.includes(normalized)) next.unshift(normalized);
  return next.slice(0, 8);
}

/**
 * Maps CLI/env topic to the YouTube search bucket.
 * - `seasonal` → active holiday or generic trending
 * - `trending` → active holiday when SCRAPE_SEASONAL is enabled (default on)
 * - explicit holiday / amigurumi / wearables / blankets → always that bucket
 */
export function resolveScrapeTopic(requested: string, date = new Date()): string {
  const topic = requested.trim().toLowerCase();
  if (topic === 'seasonal') {
    return getActiveHolidayTopic(date)?.id ?? 'trending';
  }
  if (isExplicitManualScrapeTopic(topic)) {
    return topic;
  }
  if (topic === 'trending' && seasonalScrapeEnabled()) {
    const holiday = getActiveHolidayTopic(date);
    if (holiday) return holiday.id;
  }
  return topic;
}

export function seasonalScrapeEnabled(): boolean {
  const flag = (process.env.SCRAPE_SEASONAL ?? '1').trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'off';
}

const GENERIC_TRENDING_QUERY =
  '("crochet tutorial" | "crochet pattern") ("step by step" | "full project" | "pattern") -shorts';

/** Long-form project tutorials only; API params also block Shorts and non-embeddable videos. */
export function searchQueryForScrapeTopic(topic: string): string {
  const holiday = getHolidayTopic(topic);
  if (holiday) return holiday.searchQuery;
  if (topic === 'amigurumi') {
    return '("crochet amigurumi" | "crochet plushie") ("tutorial" | "pattern") -shorts';
  }
  if (topic === 'wearables') {
    return '("crochet sweater" | "crochet cardigan" | "crochet top") ("tutorial" | "pattern") -shorts';
  }
  if (topic === 'blankets' || topic === 'blanket') {
    return '("crochet blanket" | "crochet granny square") ("tutorial" | "pattern") -shorts';
  }
  return GENERIC_TRENDING_QUERY;
}
