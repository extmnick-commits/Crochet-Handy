/** Offline regression coverage for the same matcher used by the scan sheet. */
import assert from 'node:assert/strict';

import { YARN_WEIGHTS, type YarnWeight } from '../store/machine';
import {
  beginManualYarnFindings,
  confirmVisionFindings,
  editVisionCorrections,
  getLeftoverYarnDraft,
  invalidateVisionRequest,
  patternRequestFromDraft,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
} from '../utils/leftoverYarnDraft';
import { rankScrapCatalog, readTutorialYards, type ScrapRankInput } from '../utils/scrapCatalogRank';
import { loadRepoPatternCatalog } from '../utils/scrapCatalogSource';
import { recommendConfirmedCatalog } from '../utils/scrapVisionCatalog';
import { searchAmount } from '../utils/scrapVisionOutput';
import { parseKnownYards } from '../utils/yarnAmount';

const row = (id: string, title: string, yarnWeight: YarnWeight = 'worsted', tutorialYards?: number): ScrapRankInput =>
  ({ id, title, yarnWeight, tutorialYards, tags: [] });

function checkAmounts() {
  for (const text of ['-40', '0', 'Infinity', 'NaN', '25-75', '10 grams', '1,2', '40 yards', '100001']) {
    assert.equal(parseKnownYards(text), null, `reject ${text}`);
    assert.equal(searchAmount({ yardsText: text, quantityCategory: '75-150' }), null, `do not hide ${text} with a rough range`);
  }
  assert.equal(parseKnownYards(' 40.5 '), 40.5);
  assert.equal(parseKnownYards('1,234.5'), 1234.5);
  assert.equal(searchAmount({ yardsText: '40.5', quantityCategory: 'under-25' })?.yards, 40.5);
  assert.equal(searchAmount({ yardsText: '', quantityCategory: 'uncertain' }), null);
  assert.equal(searchAmount({ yardsText: '', quantityCategory: 'skein-or-more' })?.yards, undefined, 'no invented skein length');
}

function checkRanking() {
  const bad = [
    row('blanket', '3D Flower Granny Square Baby Blanket'),
    row('cardigan', 'Flower Lace Cardigan'),
    row('section', 'Section 2: Ornament Mosaic Crochet Blanket'),
    row('part', 'Amigurumi Doll Part 8'),
    row('roundup', 'Halloween Keychains with Pattern Links'),
    row('large', 'Giant Plush Amigurumi'),
    { ...row('prose', 'Elegant Crochet Stitch'), summary: 'A flower look that can be used for a keychain.' },
    { ...row('tag', 'A Crochet Tutorial'), tags: ['sunflower-cardigan'] },
  ];
  assert.deepEqual(rankScrapCatalog(bad, { yarnWeight: 'worsted', availableYards: 150 }), [], 'exclude large, partial and incidental matches');

  const rows = [row('micro', 'Tiny Keychain'), row('small', 'Mug Coaster'), row('medium', 'Amigurumi Doll')];
  assert.equal(rankScrapCatalog(rows, { availableYards: 20 }).length, 0);
  assert.deepEqual(rankScrapCatalog(rows, { availableYards: 25 }).map((card) => card.id), ['micro']);
  assert.equal(readTutorialYards({ tutorialYards: 25.2 }), 26, 'never round requirements down');
  assert.equal(rankScrapCatalog([row('measured', 'Mug Coaster', 'worsted', 15)], { availableYards: 20 }).length, 1, 'real requirement overrides generic ceiling');
  assert.equal(rankScrapCatalog([row('over', 'Tiny Charm', 'worsted', 25.2)], { availableYards: 25 }).length, 0);
  for (const availableYards of [0, -1, NaN, Infinity]) assert.equal(rankScrapCatalog(rows, { availableYards }).length, 0);

  const crowded = Array.from({ length: 20 }, (_, i) => row(`foreign-${i}`, 'Amigurumi Doll', 'jumbo'));
  const exact = row('exact', 'Tiny Keychain', 'dk');
  const ranked = rankScrapCatalog([...crowded, row('near', 'Amigurumi Doll', 'worsted'), exact], { yarnWeight: 'dk', availableYards: 150, limit: 1 });
  assert.equal(ranked[0]?.id, 'exact', 'filter weight before limiting, and prioritize exact category');
}

function checkBundledCatalog() {
  const catalog = loadRepoPatternCatalog();
  const ids = new Set(catalog.map((pattern) => pattern.id));
  assert(catalog.length > 0);
  let matches = 0;
  for (const yarnCategory of YARN_WEIGHTS) {
    for (const yardsText of ['20', '25', '40.5', '75', '150']) {
      const result = recommendConfirmedCatalog({ yarnCategory, yardsText, gramsText: '', quantityCategory: 'uncertain' });
      assert.equal(result.status, 'results');
      if (result.status !== 'results') continue;
      assert(result.cards.length <= 6);
      for (const card of result.cards) {
        matches += 1;
        assert(ids.has(card.pattern.id), 'recommendations are real catalog tutorials');
        assert(card.pattern.videoId || card.pattern.videoUrl, 'a match opens a tutorial');
        assert(Math.abs(YARN_WEIGHTS.indexOf(card.pattern.yarnWeight) - YARN_WEIGHTS.indexOf(yarnCategory)) <= 1);
        assert(!/\b(blanket|cardigan|shawl|scarf)\b/i.test(card.pattern.title));
        if (card.tutorialYards == null) assert.equal(card.matchLabel, 'Project idea · check yarn needed');
      }
    }
  }
  assert(matches > 0, 'the actual catalog returns useful small-project matches');
  const common = recommendConfirmedCatalog({ yarnCategory: 'worsted', yardsText: '75', gramsText: '', quantityCategory: 'uncertain' });
  assert(common.status === 'results' && common.cards.length > 0, 'worsted leftovers have project ideas');
  assert.equal(recommendConfirmedCatalog({ yarnCategory: 'uncertain', yardsText: '75', gramsText: '', quantityCategory: 'uncertain' }).status, 'need-category');
  assert.equal(recommendConfirmedCatalog({ yarnCategory: 'worsted', yardsText: '-75', gramsText: '', quantityCategory: '75-150' }).status, 'invalid-amount');
  assert.equal(recommendConfirmedCatalog({ yarnCategory: 'worsted', yardsText: '', gramsText: '100', quantityCategory: 'uncertain' }).status, 'need-amount', 'grams do not become yarn length');
  const rough = recommendConfirmedCatalog({ yarnCategory: 'worsted', yardsText: '', gramsText: '', quantityCategory: '25-75' });
  assert(rough.status === 'results' && rough.cards.every((card) => card.matchLabel.startsWith('Project idea')), 'rough amounts cannot certify fit');
  console.log(`Checked ${catalog.length} catalog rows across 45 weight/amount combinations (${matches} returned cards).`);
}

function checkSessions() {
  resetLeftoverYarnDraft();
  beginManualYarnFindings();
  editVisionCorrections({ yarnCategory: 'dk', quantityCategory: 'uncertain', yardsText: '40.5', gramsText: '20' });
  const result = recommendConfirmedCatalog(getLeftoverYarnDraft().corrections!);
  confirmVisionFindings(result);
  assert(getLeftoverYarnDraft().confirmed, 'manual matching works without a photo/model');
  assert.equal(patternRequestFromDraft()?.yards, 40.5, 'draft and catalog use the same amount parser');
  editVisionCorrections({ yardsText: '-40', quantityCategory: '75-150' });
  confirmVisionFindings(recommendConfirmedCatalog(getLeftoverYarnDraft().corrections!));
  assert.equal(patternRequestFromDraft(), null, 'an invalid amount cannot start a pattern draft');
  editVisionCorrections({ yardsText: '40.5' });
  const epoch = getLeftoverYarnDraft().sessionEpoch;
  invalidateVisionRequest();
  assert(getLeftoverYarnDraft().sessionEpoch > epoch, 'cancel invalidates pending prep/download');
  assert.equal(getLeftoverYarnDraft().corrections?.yardsText, '40.5', 'cancel preserves edits');
  replaceLeftoverPhoto('file://next-yarn.jpg');
  assert.equal(getLeftoverYarnDraft().yardsText, '', 'new yarn does not inherit old yards');
  assert.equal(getLeftoverYarnDraft().gramsText, '', 'new yarn does not inherit old grams');
  assert.equal(getLeftoverYarnDraft().corrections, null);
  beginManualYarnFindings();
  assert.equal(getLeftoverYarnDraft().corrections?.yardsText, '', 'manual fallback for a new photo stays fresh');
  resetLeftoverYarnDraft();
}

checkAmounts();
checkRanking();
checkBundledCatalog();
checkSessions();
console.log('leftover matching checks passed');
