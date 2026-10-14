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
    id: 'pattern-have-you-ever-crocheted-straps-like-this-crochet',
    videoId: '24lM1S6NlPc',
    youtubeUrl: 'https://www.youtube.com/watch?v=24lM1S6NlPc',
    thumbnailUrl: 'https://i.ytimg.com/vi/24lM1S6NlPc/maxresdefault.jpg',
    title: 'Have you ever crocheted straps like this? 😁 #crochet #tutorial #straps #inspiration',
    author: 'rajutan dian eka',
    difficulty: 'beginner',
    estimatedTimeMinutes: 20,
    description: 'A quick and practical tutorial demonstrating how to crochet sturdy, decorative straps for bags, totes, or tops. This method creates a durable cord that resists stretching and adds a polished finish to any project.',
    materials: [
      { name: 'Cotton Yarn', weight: 'worsted', yardage: '40 yards' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.0 mm' },
      { type: 'Tapestry Needle', size: 'Standard' },
      { type: 'Scissors', size: 'Standard' },
    ],
    keyStitches: [
      'Chain',
      'Single Crochet',
      'Slip Stitch',
    ],
    yarnWeight: 'worsted',
    hookSize: '4.0 mm',
    totalRows: 60,
    stitchesPerRow: 4,
    tags: [
      'crochet',
      'tutorial',
      'straps',
      'bagstrap',
      'accessories',
      'cord',
    ],
  },
  {
    id: 'pattern-you-won-t-believe-how-easy-this-elegant-crochet-',
    videoId: 'YED4ZOWimsE',
    youtubeUrl: 'https://www.youtube.com/watch?v=YED4ZOWimsE',
    thumbnailUrl: 'https://i.ytimg.com/vi/YED4ZOWimsE/maxresdefault.jpg',
    title: '. You Won’t Believe How Easy This Elegant Crochet Pattern Is!',
    author: 'Crochet workshop',
    difficulty: 'easy',
    estimatedTimeMinutes: 90,
    description: 'A surprisingly simple yet elegant crochet stitch pattern designed for beginners and intermediate crocheters alike. It creates a beautifully textured fabric ideal for blankets, scarves, or decorative wraps.',
    materials: [
      { name: 'Worsted Weight Yarn', weight: 'worsted', yardage: '220 yds' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '5.0 mm' },
      { type: 'Tapestry Needle', size: 'Standard' },
      { type: 'Scissors', size: 'Standard' },
    ],
    keyStitches: [
      'Chain',
      'Single Crochet',
      'Double Crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '5.0 mm',
    totalRows: 24,
    stitchesPerRow: 32,
    tags: [
      'crochet',
      'easy crochet',
      'elegant stitch',
      'crochet pattern',
      'stitch tutorial',
      'diy',
    ],
  },
  {
    id: 'pattern-crochet-straps-in-coffee-milk-color-crochet-tuto',
    videoId: 'yxeBnV6UhXA',
    youtubeUrl: 'https://www.youtube.com/watch?v=yxeBnV6UhXA',
    thumbnailUrl: 'https://i.ytimg.com/vi/yxeBnV6UhXA/maxresdefault.jpg',
    title: 'Crochet straps in coffee milk color 👍 #crochet #tutorial #straps #inspiration',
    author: 'rajutan dian eka',
    difficulty: 'beginner',
    estimatedTimeMinutes: 30,
    description: 'Learn how to crochet sturdy and stylish bag straps in a neutral coffee milk color. This quick tutorial provides a durable strap design perfect for purses, totes, and accessories.',
    materials: [
      { name: 'Cotton yarn (coffee milk/beige)', weight: 'worsted', yardage: '45 yds' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.0 mm' },
      { type: 'Yarn Needle', size: 'Standard' },
      { type: 'Scissors', size: 'Standard' },
    ],
    keyStitches: [
      'chain',
      'single crochet',
      'slip stitch',
    ],
    yarnWeight: 'worsted',
    hookSize: '4.0 mm',
    totalRows: 100,
    stitchesPerRow: 4,
    tags: [
      'crochet',
      'straps',
      'bag strap',
      'tutorial',
      'accessories',
      'cord',
    ],
  },
  {
    id: 'pattern-wheat-ears-crochet-pattern-crochetpattern-croche',
    videoId: 'cFkprQ07R0k',
    youtubeUrl: 'https://www.youtube.com/watch?v=cFkprQ07R0k',
    thumbnailUrl: 'https://i.ytimg.com/vi/cFkprQ07R0k/maxresdefault.jpg',
    title: 'Wheat ears crochet pattern #crochetpattern #crochet #beginnersstitch',
    author: 'anxin_crochet',
    difficulty: 'beginner',
    estimatedTimeMinutes: 45,
    description: 'Learn how to crochet the decorative wheat ears stitch pattern, featuring a braided texture reminiscent of wheat stalks. This versatile stitch is beginner-friendly and ideal for blankets, scarves, and accessories.',
    materials: [
      { name: 'Worsted Yarn', weight: 'worsted', yardage: '60 yards' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.5 mm' },
      { type: 'Yarn Needle', size: 'Standard' },
      { type: 'Scissors', size: 'Standard' },
    ],
    keyStitches: [
      'Chain (ch)',
      'Single Crochet (sc)',
      'Puff Stitch (puff)',
      'Double Crochet (dc)',
      'Slip Stitch (sl st)',
    ],
    yarnWeight: 'worsted',
    hookSize: '4.5 mm',
    totalRows: 16,
    stitchesPerRow: 20,
    tags: [
      'crochet',
      'stitchpattern',
      'wheatears',
      'beginner',
      'texturedstitch',
      'tutorial',
    ],
  },
  {
    id: 'pattern-here-s-a-video-clip-of-crocheting-beautiful-gree',
    videoId: 'X7hzaw_-JOk',
    youtubeUrl: 'https://www.youtube.com/watch?v=X7hzaw_-JOk',
    thumbnailUrl: 'https://i.ytimg.com/vi/X7hzaw_-JOk/maxresdefault.jpg',
    title: 'Here\'s a video clip of crocheting beautiful green straps 💚 #crochet #tutorial #straps #inspiration',
    author: 'rajutan dian eka',
    difficulty: 'easy',
    estimatedTimeMinutes: 30,
    description: 'Learn how to crochet sturdy and decorative green straps suitable for bags, tops, and accessories. This quick project uses basic stitches to create a neat, durable cord.',
    materials: [
      { name: 'Medium Worsted Cotton Yarn (Green)', weight: 'Worsted', yardage: '40 yards' },
    ],
    tools: [
      { type: 'Crochet Hook', size: '4.0 mm' },
      { type: 'Tapestry Needle', size: 'Standard' },
      { type: 'Scissors', size: 'Standard' },
    ],
    keyStitches: [
      'Chain (ch)',
      'Single Crochet (sc)',
      'Slip Stitch (sl st)',
    ],
    yarnWeight: 'worsted',
    hookSize: '4.0 mm',
    totalRows: 80,
    stitchesPerRow: 4,
    tags: [
      'crochet',
      'straps',
      'tutorial',
      'bag strap',
      'cord',
      'diy',
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
