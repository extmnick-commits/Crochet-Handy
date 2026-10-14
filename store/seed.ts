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
  {
    id: 'pattern-oh-my-good-this-is-incredible-very-easy-tunisian',
    videoId: 'UQkHKhhoegc',
    youtubeUrl: 'https://www.youtube.com/watch?v=UQkHKhhoegc',
    thumbnailUrl: 'https://i.ytimg.com/vi/UQkHKhhoegc/maxresdefault.jpg',
    title: 'Oh my good **!! This is incredible !! Very Easy Tunisian pattern #crochet',
    author: 'Albi\'s Craft & Crochet',
    difficulty: 'easy',
    estimatedTimeMinutes: 120,
    description: 'Very easy Tunisian crochet pattern tutorial.',
    materials: [
      { name: 'Tunisian Yarn', weight: 'worsted', yardage: '300 yds' },
    ],
    tools: [
      { type: 'Tunisian crochet hook', size: '6mm' },
    ],
    keyStitches: [
      'Tunisian simple stitch',
      'slip stitch',
    ],
    yarnWeight: 'worsted',
    hookSize: '6mm',
    totalRows: 40,
    stitchesPerRow: 30,
    tags: [
      'tunisian',
      'crochet',
      'beginner',
      'easy',
      'tunisian simple stitch',
      'slip stitch',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-this-gorgeous-crochet-stitch-repeats-in-just-1-r',
    videoId: 'rQHJb5xkdRU',
    youtubeUrl: 'https://www.youtube.com/watch?v=rQHJb5xkdRU',
    thumbnailUrl: 'https://i.ytimg.com/vi/rQHJb5xkdRU/maxresdefault.jpg',
    title: 'THIS GORGEOUS CROCHET STITCH REPEATS IN JUST 1 ROW! CROCHET PATTERN',
    author: 'Minin Art',
    difficulty: 'beginner',
    estimatedTimeMinutes: 90,
    description: 'Gorgeous crochet stitch that repeats in just 1 row, suitable for scarves and bags.',
    materials: [
      { name: 'Basic Yarn', weight: 'worsted', yardage: '250 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '5mm' },
    ],
    keyStitches: [
      'single crochet',
      'double crochet',
    ],
    yarnWeight: 'worsted',
    hookSize: '5mm',
    totalRows: 30,
    stitchesPerRow: 40,
    tags: [
      'scarf',
      'bag',
      'beginner',
      'single crochet',
      'double crochet',
      'wearables',
      'blanket',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-just-1-row-so-simple-and-speedy-try-this-easy-cr',
    videoId: 'DW6q8n40F98',
    youtubeUrl: 'https://www.youtube.com/watch?v=DW6q8n40F98',
    thumbnailUrl: 'https://i.ytimg.com/vi/DW6q8n40F98/maxresdefault.jpg',
    title: 'Just 1 Row, SO simple and speedy! TRY this easy crochet pattern: crochet stitch You’ll Love to Make',
    author: 'Easy Crochet Stitches',
    difficulty: 'easy',
    estimatedTimeMinutes: 60,
    description: 'Just 1 row, simple and speedy crochet pattern with stunning texture.',
    materials: [
      { name: 'Texture Yarn', weight: 'dk', yardage: '200 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '4.5mm' },
    ],
    keyStitches: [
      'double crochet',
      'chain',
    ],
    yarnWeight: 'dk',
    hookSize: '4.5mm',
    totalRows: 25,
    stitchesPerRow: 35,
    tags: [
      'texture',
      'easy',
      'fast',
      'double crochet',
      'wearables',
      'blanket',
      'chain',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-easy-crochet-luxe-results-try-this-elegant-croch',
    videoId: 'ly4R7oULlLQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=ly4R7oULlLQ',
    thumbnailUrl: 'https://i.ytimg.com/vi/ly4R7oULlLQ/maxresdefault.jpg',
    title: 'Easy Crochet, Luxe Results: TRY this elegant crochet pattern! It\'s easier than you think!',
    author: 'Beautiful Crochet Pattern',
    difficulty: 'intermediate',
    estimatedTimeMinutes: 150,
    description: 'Elegant crochet pattern with luxe results that is surprisingly simple to make.',
    materials: [
      { name: 'Luxe Yarn', weight: 'sport', yardage: '400 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '4mm' },
    ],
    keyStitches: [
      'front post double crochet',
      'back post double crochet',
      'treble crochet',
    ],
    yarnWeight: 'sport',
    hookSize: '4mm',
    totalRows: 50,
    stitchesPerRow: 45,
    tags: [
      'elegant',
      'luxe',
      'intermediate',
      'post stitches',
      'wearables',
      'halloween',
      'blanket',
      'bag',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-amazing-simple-tunusian-crochet-pattern-for-bags',
    videoId: 'uofOZ3YCtn8',
    youtubeUrl: 'https://www.youtube.com/watch?v=uofOZ3YCtn8',
    thumbnailUrl: 'https://i.ytimg.com/vi/uofOZ3YCtn8/maxresdefault.jpg',
    title: 'Amazing Simple Tunusian Crochet Pattern for Bags & Headbands 💚#crochet #bagideas #headband',
    author: 'Örgü Şenliği',
    difficulty: 'beginner',
    estimatedTimeMinutes: 80,
    description: 'Amazing simple Tunisian crochet pattern specifically designed for bags and headbands.',
    materials: [
      { name: 'Cotton Yarn', weight: 'worsted', yardage: '150 yds' },
    ],
    tools: [
      { type: 'Tunisian crochet hook', size: '5.5mm' },
    ],
    keyStitches: [
      'Tunisian simple stitch',
      'slip stitch',
    ],
    yarnWeight: 'worsted',
    hookSize: '5.5mm',
    totalRows: 20,
    stitchesPerRow: 25,
    tags: [
      'bag',
      'headband',
      'tunisian',
      'accessories',
      'tunisian simple stitch',
      'slip stitch',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-wow-beautiful-easy-crochet-table-cover-pattern-f',
    videoId: '_VDujD2CTE8',
    youtubeUrl: 'https://www.youtube.com/watch?v=_VDujD2CTE8',
    thumbnailUrl: 'https://i.ytimg.com/vi/_VDujD2CTE8/maxresdefault.jpg',
    title: 'WoW Beautiful & EASY 😍Crochet Table Cover Pattern for Beginners 💯✅ New Crochet Pattern 👌',
    author: 'Crochet by Kay',
    difficulty: 'easy',
    estimatedTimeMinutes: 180,
    description: 'Beautiful and easy crochet table cover or table runner pattern for beginners.',
    materials: [
      { name: 'Cotton Thread', weight: 'fingering', yardage: '600 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '3mm' },
    ],
    keyStitches: [
      'double crochet',
      'chain',
      'slip stitch',
    ],
    yarnWeight: 'fingering',
    hookSize: '3mm',
    totalRows: 60,
    stitchesPerRow: 80,
    tags: [
      'table runner',
      'table cover',
      'home decor',
      'beginner',
      'double crochet',
      'chain',
      'slip stitch',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-wow-you-have-to-see-trendy-crochet-pattern-croch',
    videoId: 'KlqEnbxkwj0',
    youtubeUrl: 'https://www.youtube.com/watch?v=KlqEnbxkwj0',
    thumbnailUrl: 'https://i.ytimg.com/vi/KlqEnbxkwj0/maxresdefault.jpg',
    title: 'WOW, You Have to SEE! Trendy crochet pattern! Crochet tutorial for beginners: Easy crochet stitches',
    author: 'Easy Crochet Stitches',
    difficulty: 'beginner',
    estimatedTimeMinutes: 240,
    description: 'Trendy crochet baby blanket pattern, easy tutorial for beginners.',
    materials: [
      { name: 'Baby Soft Yarn', weight: 'bulky', yardage: '500 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '6.5mm' },
    ],
    keyStitches: [
      'half double crochet',
      'chain',
    ],
    yarnWeight: 'bulky',
    hookSize: '6.5mm',
    totalRows: 45,
    stitchesPerRow: 50,
    tags: [
      'blanket',
      'baby blanket',
      'beginner',
      'half double crochet',
      'wearables',
      'chain',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-luxe-looking-crochet-made-simple-this-easy-croch',
    videoId: 'sOe39cqHjOM',
    youtubeUrl: 'https://www.youtube.com/watch?v=sOe39cqHjOM',
    thumbnailUrl: 'https://i.ytimg.com/vi/sOe39cqHjOM/maxresdefault.jpg',
    title: 'Luxe-Looking Crochet, Made Simple! This Easy Crochet Pattern Will Transform Your Crochet Projects',
    author: 'Crochet Knitting Time',
    difficulty: 'easy',
    estimatedTimeMinutes: 220,
    description: 'Luxe-looking crochet baby blanket made simple.',
    materials: [
      { name: 'Cozy Blanket Yarn', weight: 'bulky', yardage: '550 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '7mm' },
    ],
    keyStitches: [
      'cluster stitch',
      'double crochet',
    ],
    yarnWeight: 'bulky',
    hookSize: '7mm',
    totalRows: 40,
    stitchesPerRow: 45,
    tags: [
      'blanket',
      'baby blanket',
      'luxe',
      'cluster stitch',
      'wearables',
      'double crochet',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-one-of-a-kind-let-s-create-a-never-before-seen-c',
    videoId: 'KYVqo1au_Jo',
    youtubeUrl: 'https://www.youtube.com/watch?v=KYVqo1au_Jo',
    thumbnailUrl: 'https://i.ytimg.com/vi/KYVqo1au_Jo/maxresdefault.jpg',
    title: 'ONE-OF-A-KIND! Let\'s Create a NEVER-BEFORE-SEEN Crochet Pattern, SUPER EASY & Beginner Friendly',
    author: 'Knitting Works',
    difficulty: 'beginner',
    estimatedTimeMinutes: 100,
    description: 'One-of-a-kind, super easy, and beginner-friendly crochet pattern.',
    materials: [
      { name: 'Unique Yarn', weight: 'worsted', yardage: '300 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '5mm' },
    ],
    keyStitches: [
      'single crochet',
      'chain',
      'puff stitch',
    ],
    yarnWeight: 'worsted',
    hookSize: '5mm',
    totalRows: 30,
    stitchesPerRow: 35,
    tags: [
      'beginner',
      'unique',
      'puff stitch',
      'easy',
      'wearables',
      'blanket',
      'bag',
      'single crochet',
    ],
    bookmarks: [],
  },
  {
    id: 'pattern-8h0HLLDS3nc',
    videoId: '8h0HLLDS3nc',
    youtubeUrl: 'https://www.youtube.com/watch?v=8h0HLLDS3nc',
    thumbnailUrl: 'https://i.ytimg.com/vi/8h0HLLDS3nc/maxresdefault.jpg',
    title: 'FANTASTIC!🧶🩷Very Simple and Beautiful Crochet pattern/ Crochet baby blanket',
    author: 'Knitting Works',
    difficulty: 'beginner',
    estimatedTimeMinutes: 200,
    description: 'Very simple and beautiful crochet pattern specifically for a baby blanket.',
    materials: [
      { name: 'Baby Yarn', weight: 'dk', yardage: '450 yds' },
    ],
    tools: [
      { type: 'crochet hook', size: '4mm' },
    ],
    keyStitches: [
      'shell stitch',
      'double crochet',
      'chain',
    ],
    yarnWeight: 'dk',
    hookSize: '4mm',
    totalRows: 50,
    stitchesPerRow: 60,
    tags: [
      'blanket',
      'baby blanket',
      'shell stitch',
      'beginner',
      'wearables',
      'bag',
      'double crochet',
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
