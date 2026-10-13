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
  type NewPatternInput,
  type YarnStashItem,
} from './machine';

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

function seedPattern(id: string, input: NewPatternInput): CrochetPattern {
  const pattern = buildPattern(id, input);
  if (!pattern) {
    throw new Error(`Seed pattern "${input.title}" could not be built from its YouTube URL.`);
  }
  return pattern;
}

export function createSeedData(): CrochetPersistedSlice {
  const patterns: CrochetPattern[] = [
    seedPattern('pattern-little-fawn', {
      title: 'Little Fawn Amigurumi',
      creator: "Stella's Yarn Universe",
      youtubeUrl: 'https://www.youtube.com/watch?v=o_ge08T0-lA',
      difficulty: 'intermediate',
      yarnWeight: 'dk',
      hookSize: '2.5 mm',
      totalRows: 40,
      stitchesPerRow: 36,
      tags: ['amigurumi', 'plush', 'deer'],
    }),
    seedPattern('pattern-granny-cardigan', {
      title: 'Classic Granny Square Cardigan',
      creator: "Katie's Crochet",
      youtubeUrl: 'https://www.youtube.com/watch?v=9iDtHf0vkmI',
      difficulty: 'beginner',
      yarnWeight: 'worsted',
      hookSize: '5.0 mm',
      totalRows: 48,
      stitchesPerRow: 78,
      tags: ['cardigan', 'granny square'],
    }),
    seedPattern('pattern-sunflower-square', {
      title: 'Sunflower Granny Square',
      creator: 'Cozy Rosie Crochet',
      youtubeUrl: 'https://www.youtube.com/watch?v=DXcQGs98KAw',
      difficulty: 'easy',
      yarnWeight: 'bulky',
      hookSize: '6.0 mm',
      totalRows: 8,
      stitchesPerRow: 24,
      tags: ['granny square', 'flower'],
    }),
    seedPattern('pattern-cat-ear-beanie', {
      title: 'Granny Square Cat Ear Beanie',
      creator: 'Viv Crochets',
      youtubeUrl: 'https://www.youtube.com/watch?v=k87KuH_1M4A',
      difficulty: 'easy',
      yarnWeight: 'worsted',
      hookSize: '5.0 mm',
      totalRows: 24,
      stitchesPerRow: 64,
      tags: ['hat', 'granny square'],
    }),
    seedPattern('pattern-sunflower-duster', {
      title: 'Sunny Sunflower Duster',
      creator: "MJ's Off The Hook Designs",
      youtubeUrl: 'https://www.youtube.com/watch?v=RJrBzTv612A',
      difficulty: 'intermediate',
      yarnWeight: 'worsted',
      hookSize: '5.5 mm',
      totalRows: 60,
      stitchesPerRow: 90,
      tags: ['cardigan', 'sunflower'],
    }),
    seedPattern('pattern-bunny-headphones', {
      title: 'Bunny with Headphones',
      creator: 'Tata Crochet Patterns',
      youtubeUrl: 'https://www.youtube.com/watch?v=Zk4DMb2Rx84',
      difficulty: 'easy',
      yarnWeight: 'dk',
      hookSize: '2.5 mm',
      totalRows: 22,
      stitchesPerRow: 32,
      tags: ['amigurumi', 'bunny'],
    }),
  ];

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
