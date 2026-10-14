/**
 * First-launch data. Real tutorials, so thumbnails and video ids resolve.
 * The active make is paused on purpose: a running seed timestamp would keep
 * counting for days after install and look like a stuck timer.
 */
import type { VideoBookmark } from '../utils/chapters';
import {
  buildPattern,
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
  /** Optional override; otherwise generated from duration and row count. */
  bookmarks?: VideoBookmark[];
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
  skeinCount: 2,
};

const champagne: YarnStashItem = {
  id: 'yarn-champagne',
  hexColor: '#F3E6C8',
  brand: 'Paintbox Yarns',
  colorName: 'Champagne White',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  skeinCount: 1,
};

const coffeeBean: YarnStashItem = {
  id: 'yarn-coffee-bean',
  hexColor: '#4B3428',
  brand: 'Paintbox Yarns',
  colorName: 'Coffee Bean',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  skeinCount: 3,
};

const blushPink: YarnStashItem = {
  id: 'yarn-blush-pink',
  hexColor: '#F0B7C4',
  brand: 'Paintbox Yarns',
  colorName: 'Blush Pink',
  yarnWeight: 'dk',
  hookSize: '2.5 mm',
  skeinCount: 1,
};

const mustard: YarnStashItem = {
  id: 'yarn-mustard',
  hexColor: '#D4A017',
  brand: 'Lion Brand',
  colorName: 'Mustard',
  yarnWeight: 'worsted',
  hookSize: '5.5 mm',
  skeinCount: 2,
};

const sage: YarnStashItem = {
  id: 'yarn-sage',
  hexColor: '#9CAF88',
  brand: 'Stylecraft',
  colorName: 'Sage',
  yarnWeight: 'bulky',
  hookSize: '6.0 mm',
  skeinCount: 1,
};

function patternFromSeed(entry: SeedPattern): CrochetPattern {
  const bookmarks = entry.bookmarks ?? [];
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
    bookmarks,
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
    difficulty: 'easy',
    estimatedTimeMinutes: 120,
    description: 'An elegant and easy crochet pattern suitable for various projects.',
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
      'crochet',
      'tutorial',
      'easy',
      'elegant',
      'blanket',
      'scarf',
      'chain',
      'single crochet',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-super-easy-crochet-pattern-for-beginners-lovely-',
    videoId: 'PGb3BmguXAo',
    youtubeUrl: 'https://www.youtube.com/watch?v=PGb3BmguXAo',
    thumbnailUrl: 'https://i.ytimg.com/vi/PGb3BmguXAo/maxresdefault.jpg',
    title: 'SUPER EASY Crochet Pattern for Beginners! 😍 LOVELY Crochet Stitch for Baby Blanket, Bag and Scarf',
    author: 'Massive Crochet',
    difficulty: 'beginner',
    estimatedTimeMinutes: 90,
    description: 'A super easy crochet pattern for beginners, ideal for baby blankets, bags, and scarves with a lovely unique stitch.',
    materials: [
      { name: 'Baby Yarn', weight: 'DK', yardage: '250' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.5 mm' },
    ],
    keyStitches: [
      'chain',
      'single crochet',
      'double crochet',
    ],
    yarnWeight: 'dk',
    hookSize: '4.5 mm',
    totalRows: 8,
    stitchesPerRow: 36,
    tags: [
      'crochetpattern',
      'crochet',
      'crochettutorial',
      'crochetblanket',
      'crocheting',
      'blanket',
      'bag',
      'scarf',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-different-technique-sequential-crochet-pattern-e',
    videoId: '9Dao_nzpe50',
    youtubeUrl: 'https://www.youtube.com/watch?v=9Dao_nzpe50',
    thumbnailUrl: 'https://i.ytimg.com/vi/9Dao_nzpe50/maxresdefault.jpg',
    title: 'different technique ** sequential crochet pattern ... easy crochet blanket pattern #crochet #knit',
    author: 'Albi\'s Craft & Crochet',
    difficulty: 'intermediate',
    estimatedTimeMinutes: 180,
    description: 'A sequential crochet pattern utilizing a different technique to create a beautiful and easy crochet blanket.',
    materials: [
      { name: 'Blanket Yarn', weight: 'Bulky', yardage: '500' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '6.0 mm' },
    ],
    keyStitches: [
      'chain',
      'sequential stitch',
    ],
    yarnWeight: 'bulky',
    hookSize: '6.0 mm',
    totalRows: 15,
    stitchesPerRow: 36,
    tags: [
      'crochet',
      'knit',
      'blanket',
      'sequential crochet',
      'easy',
      'chain',
      'sequential stitch',
    ],
    bookmarks: [],
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
    description: 'A very simple, beautiful, and refreshingly unique crochet pattern ideal for baby blankets and beginners.',
    materials: [
      { name: 'Baby Cotton Yarn', weight: 'DK', yardage: '350' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.0 mm' },
    ],
    keyStitches: [
      'chain',
      'single crochet',
      'double crochet',
    ],
    yarnWeight: 'dk',
    hookSize: '4.0 mm',
    totalRows: 13,
    stitchesPerRow: 36,
    tags: [
      'crochet',
      'baby blanket',
      'beginner',
      'easy',
      'blanket',
      'wearables',
      'bag',
      'chain',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-easy-crochet-that-looks-expensive-try-this-styli',
    videoId: 'fV378JwXitw',
    youtubeUrl: 'https://www.youtube.com/watch?v=fV378JwXitw',
    thumbnailUrl: 'https://i.ytimg.com/vi/fV378JwXitw/maxresdefault.jpg',
    title: 'Easy crochet that looks expensive! TRY this stylish crochet pattern: crochet tutorial for beginners',
    author: 'Easy Crochet Stitches',
    difficulty: 'beginner',
    estimatedTimeMinutes: 100,
    description: 'An easy and stylish crochet pattern that looks expensive yet requires no prior experience or fancy tools.',
    materials: [
      { name: 'Standard Yarn', weight: 'Worsted', yardage: '200' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '5.5 mm' },
    ],
    keyStitches: [
      'chain',
      'half double crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '5.5 mm',
    totalRows: 8,
    stitchesPerRow: 36,
    tags: [
      'crochet',
      'stylish',
      'beginner',
      'tutorial',
      'wearables',
      'halloween',
      'blanket',
      'chain',
    ],
    bookmarks: [],
  },
];
// <seed-patterns-end>

export function createSeedData(): CrochetPersistedSlice {
  const patterns: CrochetPattern[] = SEED_PATTERNS.map(patternFromSeed);

  const bambi: CrochetProject = {
    id: 'project-bambi',
    name: 'Bambi Amigurumi Plush',
    patternId: 'pattern-super-easy-crochet-pattern-for-beginners-lovely-',
    status: 'in-progress',
    currentStitch: 14,
    stitchesPerRow: 60,
    currentRow: 28,
    totalRows: 40,
    hookSize: '4.0 mm',
    yarnWeight: 'worsted',
    timerStartedAt: null,
    accumulatedSeconds: SEED_BANKED_SECONDS,
    yarnColors: [
      { id: 'color-soft-fudge', hexColor: softFudge.hexColor, label: 'Soft Fudge' },
      { id: 'color-champagne', hexColor: champagne.hexColor, label: 'Champagne' },
      { id: 'color-coffee-bean', hexColor: coffeeBean.hexColor, label: 'Coffee Bean' },
      { id: 'color-blush', hexColor: blushPink.hexColor, label: 'Blush Pink' },
    ],
    rowNote: '',
    checkpoints: [
      { id: 'cp-beginning', label: 'Beginning', timestampSeconds: 0 },
      { id: 'cp-materials', label: 'Materials', timestampSeconds: 60 },
      { id: 'cp-main-pattern', label: 'Main pattern', timestampSeconds: 300 },
    ],
    createdAt: SEED_STARTED,
    updatedAt: SEED_UPDATED,
  };

  return {
    patterns,
    projects: [bambi],
    activeProjectId: bambi.id,
    yarnStash: [softFudge, champagne, coffeeBean, blushPink, mustard, sage],
    progressPhotos: [],
  };
}
