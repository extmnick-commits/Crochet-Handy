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
    id: 'pattern-you-won-t-believe-how-easy-this-elegant-crochet-',
    videoId: 'YED4ZOWimsE',
    youtubeUrl: 'https://www.youtube.com/watch?v=YED4ZOWimsE',
    thumbnailUrl: 'https://i.ytimg.com/vi/YED4ZOWimsE/maxresdefault.jpg',
    title: '. You Won’t Believe How Easy This Elegant Crochet Pattern Is!',
    author: 'Crochet workshop',
    difficulty: 'beginner',
    estimatedTimeMinutes: 120,
    description: 'An elegant and easy crochet pattern suitable for various handmade projects.',
    materials: [
      { name: 'Yarn', weight: 'Worsted', yardage: '300' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '5.0 mm' },
    ],
    keyStitches: [
      'chain',
      'single crochet',
      'double crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '5.0 mm',
    totalRows: 10,
    stitchesPerRow: 36,
    tags: [
      'chain',
      'single crochet',
      'double crochet',
    ],
  },
  {
    id: 'pattern-super-easy-crochet-pattern-for-beginners-lovely-',
    videoId: 'PGb3BmguXAo',
    youtubeUrl: 'https://www.youtube.com/watch?v=PGb3BmguXAo',
    thumbnailUrl: 'https://i.ytimg.com/vi/PGb3BmguXAo/maxresdefault.jpg',
    title: 'SUPER EASY Crochet Pattern for Beginners! 😍 LOVELY Crochet Stitch for Baby Blanket, Bag and Scarf',
    author: 'Massive Crochet',
    difficulty: 'beginner',
    estimatedTimeMinutes: 180,
    description: 'A super easy crochet pattern perfect for beginners, ideal for making baby blankets, bags, and scarves.',
    materials: [
      { name: 'Baby Yarn', weight: 'DK', yardage: '450' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.0 mm' },
    ],
    keyStitches: [
      'chain',
      'double crochet',
    ],
    yarnWeight: 'dk',
    hookSize: '4.0 mm',
    totalRows: 15,
    stitchesPerRow: 36,
    tags: [
      'chain',
      'double crochet',
    ],
  },
  {
    id: 'pattern-different-technique-sequential-crochet-pattern-e',
    videoId: '9Dao_nzpe50',
    youtubeUrl: 'https://www.youtube.com/watch?v=9Dao_nzpe50',
    thumbnailUrl: 'https://i.ytimg.com/vi/9Dao_nzpe50/maxresdefault.jpg',
    title: 'different technique ** sequential crochet pattern ... easy crochet blanket pattern #crochet #knit',
    author: 'Albi\'s Craft & Crochet',
    difficulty: 'intermediate',
    estimatedTimeMinutes: 240,
    description: 'A unique sequential crochet pattern using a different technique, great for blankets.',
    materials: [
      { name: 'Blanket Yarn', weight: 'Bulky', yardage: '600' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '6.0 mm' },
    ],
    keyStitches: [
      'chain',
      'slip stitch',
      'half double crochet',
    ],
    yarnWeight: 'bulky',
    hookSize: '6.0 mm',
    totalRows: 20,
    stitchesPerRow: 36,
    tags: [
      'chain',
      'slip stitch',
      'half double crochet',
    ],
  },
  {
    id: 'pattern-fantastic-very-simple-and-beautiful-crochet-patt',
    videoId: 'XR-U-4WmYF4',
    youtubeUrl: 'https://www.youtube.com/watch?v=XR-U-4WmYF4',
    thumbnailUrl: 'https://i.ytimg.com/vi/XR-U-4WmYF4/maxresdefault.jpg',
    title: 'FANTASTIC!🧶💛Very Simple and Beautiful Crochet pattern/ Crochet baby blanket',
    author: 'Knitting Works',
    difficulty: 'beginner',
    estimatedTimeMinutes: 150,
    description: 'A very simple and beautiful crochet pattern ideal for creating a wonderful baby blanket.',
    materials: [
      { name: 'Soft Yarn', weight: 'Light', yardage: '400' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.5 mm' },
    ],
    keyStitches: [
      'chain',
      'single crochet',
      'treble crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '4.5 mm',
    totalRows: 13,
    stitchesPerRow: 36,
    tags: [
      'chain',
      'single crochet',
      'treble crochet',
    ],
  },
  {
    id: 'pattern-easy-crochet-that-looks-expensive-try-this-styli',
    videoId: 'fV378JwXitw',
    youtubeUrl: 'https://www.youtube.com/watch?v=fV378JwXitw',
    thumbnailUrl: 'https://i.ytimg.com/vi/fV378JwXitw/maxresdefault.jpg',
    title: 'Easy crochet that looks expensive! TRY this stylish crochet pattern: crochet tutorial for beginners',
    author: 'Easy Crochet Stitches',
    difficulty: 'beginner',
    estimatedTimeMinutes: 90,
    description: 'An easy crochet pattern that looks expensive and stylish, perfect for beginners looking for a rewarding project.',
    materials: [
      { name: 'Standard Yarn', weight: 'Worsted', yardage: '250' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '5.5 mm' },
    ],
    keyStitches: [
      'chain',
      'double crochet',
      'front post double crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '5.5 mm',
    totalRows: 8,
    stitchesPerRow: 36,
    tags: [
      'chain',
      'double crochet',
      'front post double crochet',
    ],
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
