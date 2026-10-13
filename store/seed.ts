/**
 * First-launch data. Real tutorials, so thumbnails and video ids resolve.
 * The active make is paused on purpose: a running seed timestamp would keep
 * counting for days after install and look like a stuck timer.
 */
import {
  buildPattern,
  slotFromStash,
  type AmsSlots,
  type CrochetPattern,
  type CrochetPersistedSlice,
  type CrochetProject,
  type PatternDifficulty,
  type YarnStashItem,
  type YarnWeight,
} from './machine';

export type SeedPatternMaterial = {
  name: string;
  weight: string;
  yardage: string;
};

export type SeedPatternTool = {
  type: string;
  size: string;
};

export type SeedPattern = {
  id: string;
  videoId: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  title: string;
  author: string;
  difficulty: PatternDifficulty;
  estimatedTimeMinutes: number;
  description: string;
  materials: SeedPatternMaterial[];
  tools: SeedPatternTool[];
  keyStitches: string[];
  yarnWeight: YarnWeight;
  hookSize: string;
  totalRows: number;
  stitchesPerRow: number;
  tags: string[];
};

const SEED_STARTED = Date.UTC(2026, 9, 4, 17, 30, 0);
const SEED_UPDATED = Date.UTC(2026, 9, 13, 15, 10, 0);
/** 4 hours 18 minutes already on the hook before this session. */
const SEED_BANKED_SECONDS = 4 * 60 * 60 + 18 * 60;

const softFudge: YarnStashItem = {
  id: 'yarn-soft-fudge',
  hexColor: '#C6A36E',
  brand: 'Paintbox Yarns',
  colorName: 'Soft Fudge',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  remainingPercent: 58,
};

const champagne: YarnStashItem = {
  id: 'yarn-champagne',
  hexColor: '#F3E6C8',
  brand: 'Paintbox Yarns',
  colorName: 'Champagne White',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  remainingPercent: 76,
};

const coffeeBean: YarnStashItem = {
  id: 'yarn-coffee-bean',
  hexColor: '#4B3428',
  brand: 'Paintbox Yarns',
  colorName: 'Coffee Bean',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  remainingPercent: 91,
};

const blushPink: YarnStashItem = {
  id: 'yarn-blush-pink',
  hexColor: '#F0B7C4',
  brand: 'Paintbox Yarns',
  colorName: 'Blush Pink',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  remainingPercent: 97,
};

const mustard: YarnStashItem = {
  id: 'yarn-mustard',
  hexColor: '#D4A017',
  brand: 'Lion Brand',
  colorName: 'Mustard',
  yarnWeight: 'worsted',
  hookSize: '5.5 mm',
  remainingPercent: 100,
};

const sage: YarnStashItem = {
  id: 'yarn-sage',
  hexColor: '#9CAF88',
  brand: 'Stylecraft',
  colorName: 'Sage',
  yarnWeight: 'bulky',
  hookSize: '6.0 mm',
  remainingPercent: 64,
};

function patternFromSeed(entry: SeedPattern): CrochetPattern {
  const pattern = buildPattern(entry.id, {
    title: entry.title,
    creator: entry.author,
    youtubeUrl: entry.youtubeUrl,
    difficulty: entry.difficulty,
    yarnWeight: entry.yarnWeight,
    hookSize: entry.hookSize,
    totalRows: entry.totalRows,
    stitchesPerRow: entry.stitchesPerRow,
    tags: entry.tags,
  });
  if (!pattern) {
    throw new Error(`Seed pattern "${entry.title}" could not be built from its YouTube URL.`);
  }
  return pattern;
}

// <seed-patterns-start>
export const SEED_PATTERNS: SeedPattern[] = [
  {
    id: 'pattern-little-fawn',
    videoId: 'o_ge08T0-lA',
    youtubeUrl: 'https://www.youtube.com/watch?v=o_ge08T0-lA',
    thumbnailUrl: 'https://i.ytimg.com/vi/o_ge08T0-lA/maxresdefault.jpg',
    title: 'Little Fawn Amigurumi',
    author: "Stella's Yarn Universe",
    difficulty: 'intermediate',
    estimatedTimeMinutes: 480,
    description: 'Step-by-step amigurumi deer plush with shaping and color changes.',
    materials: [{ name: 'DK cotton yarn', weight: 'dk', yardage: '200 yds' }],
    tools: [{ type: 'crochet hook', size: '2.5 mm' }],
    keyStitches: ['single crochet', 'increase', 'decrease'],
    yarnWeight: 'dk',
    hookSize: '2.5 mm',
    totalRows: 40,
    stitchesPerRow: 36,
    tags: ['amigurumi', 'plush', 'deer'],
  },
  {
    id: 'pattern-granny-cardigan',
    videoId: '9iDtHf0vkmI',
    youtubeUrl: 'https://www.youtube.com/watch?v=9iDtHf0vkmI',
    thumbnailUrl: 'https://i.ytimg.com/vi/9iDtHf0vkmI/maxresdefault.jpg',
    title: 'Classic Granny Square Cardigan',
    author: "Katie's Crochet",
    difficulty: 'beginner',
    estimatedTimeMinutes: 720,
    description: 'Beginner-friendly granny square cardigan assembled from motifs.',
    materials: [{ name: 'Worsted weight yarn', weight: 'worsted', yardage: '1200 yds' }],
    tools: [{ type: 'crochet hook', size: '5.0 mm' }],
    keyStitches: ['granny square', 'double crochet', 'chain'],
    yarnWeight: 'worsted',
    hookSize: '5.0 mm',
    totalRows: 48,
    stitchesPerRow: 78,
    tags: ['cardigan', 'granny square'],
  },
  {
    id: 'pattern-sunflower-square',
    videoId: 'DXcQGs98KAw',
    youtubeUrl: 'https://www.youtube.com/watch?v=DXcQGs98KAw',
    thumbnailUrl: 'https://i.ytimg.com/vi/DXcQGs98KAw/maxresdefault.jpg',
    title: 'Sunflower Granny Square',
    author: 'Cozy Rosie Crochet',
    difficulty: 'easy',
    estimatedTimeMinutes: 45,
    description: 'Bold sunflower motif worked as a granny square.',
    materials: [{ name: 'Bulky yarn', weight: 'bulky', yardage: '80 yds' }],
    tools: [{ type: 'crochet hook', size: '6.0 mm' }],
    keyStitches: ['granny square', 'double crochet'],
    yarnWeight: 'bulky',
    hookSize: '6.0 mm',
    totalRows: 8,
    stitchesPerRow: 24,
    tags: ['granny square', 'flower'],
  },
  {
    id: 'pattern-cat-ear-beanie',
    videoId: 'k87KuH_1M4A',
    youtubeUrl: 'https://www.youtube.com/watch?v=k87KuH_1M4A',
    thumbnailUrl: 'https://i.ytimg.com/vi/k87KuH_1M4A/maxresdefault.jpg',
    title: 'Granny Square Cat Ear Beanie',
    author: 'Viv Crochets',
    difficulty: 'easy',
    estimatedTimeMinutes: 180,
    description: 'Cat-ear beanie built from granny squares.',
    materials: [{ name: 'Worsted weight yarn', weight: 'worsted', yardage: '300 yds' }],
    tools: [{ type: 'crochet hook', size: '5.0 mm' }],
    keyStitches: ['granny square', 'single crochet'],
    yarnWeight: 'worsted',
    hookSize: '5.0 mm',
    totalRows: 24,
    stitchesPerRow: 64,
    tags: ['hat', 'granny square'],
  },
  {
    id: 'pattern-sunflower-duster',
    videoId: 'RJrBzTv612A',
    youtubeUrl: 'https://www.youtube.com/watch?v=RJrBzTv612A',
    thumbnailUrl: 'https://i.ytimg.com/vi/RJrBzTv612A/maxresdefault.jpg',
    title: 'Sunny Sunflower Duster',
    author: "MJ's Off The Hook Designs",
    difficulty: 'intermediate',
    estimatedTimeMinutes: 900,
    description: 'Long sunflower-themed duster cardigan.',
    materials: [{ name: 'Worsted weight yarn', weight: 'worsted', yardage: '1800 yds' }],
    tools: [{ type: 'crochet hook', size: '5.5 mm' }],
    keyStitches: ['double crochet', 'shell stitch'],
    yarnWeight: 'worsted',
    hookSize: '5.5 mm',
    totalRows: 60,
    stitchesPerRow: 90,
    tags: ['cardigan', 'sunflower'],
  },
  {
    id: 'pattern-bunny-headphones',
    videoId: 'Zk4DMb2Rx84',
    youtubeUrl: 'https://www.youtube.com/watch?v=Zk4DMb2Rx84',
    thumbnailUrl: 'https://i.ytimg.com/vi/Zk4DMb2Rx84/maxresdefault.jpg',
    title: 'Bunny with Headphones',
    author: 'Tata Crochet Patterns',
    difficulty: 'easy',
    estimatedTimeMinutes: 240,
    description: 'Cute bunny amigurumi with headphone accessory.',
    materials: [{ name: 'DK yarn', weight: 'dk', yardage: '150 yds' }],
    tools: [{ type: 'crochet hook', size: '2.5 mm' }],
    keyStitches: ['single crochet', 'magic ring'],
    yarnWeight: 'dk',
    hookSize: '2.5 mm',
    totalRows: 22,
    stitchesPerRow: 32,
    tags: ['amigurumi', 'bunny'],
  },
];
// <seed-patterns-end>

export function createSeedData(): CrochetPersistedSlice {
  const patterns: CrochetPattern[] = SEED_PATTERNS.map(patternFromSeed);

  const slots: AmsSlots = [
    slotFromStash('A1', softFudge),
    slotFromStash('A2', champagne),
    slotFromStash('A3', coffeeBean),
    slotFromStash('A4', blushPink),
  ];

  const bambi: CrochetProject = {
    id: 'project-bambi',
    name: 'Bambi Amigurumi Plush',
    patternId: 'pattern-little-fawn',
    status: 'in-progress',
    currentStitch: 17,
    stitchesPerRow: 36,
    currentRow: 28,
    totalRows: 40,
    timerStartedAt: null,
    accumulatedSeconds: SEED_BANKED_SECONDS,
    slots,
    createdAt: SEED_STARTED,
    updatedAt: SEED_UPDATED,
  };

  return {
    patterns,
    projects: [bambi],
    activeProjectId: bambi.id,
    yarnStash: [softFudge, champagne, coffeeBean, blushPink, mustard, sage],
  };
}
