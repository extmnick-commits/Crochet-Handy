import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVERGREEN_SCRAPE_CATEGORY_IDS, VARIETY_SCRAPE_TOPIC_IDS } from '../utils/holidayTopics';
import { selectVarietyCandidates } from '../utils/scrapeSelection';

const workflow = readFileSync('.github/workflows/pattern-scraper.yml', 'utf8');
assert.match(workflow, /cron:\s*'17 10 \* \* \*'/);
const scheduledPlan = workflow.split('if [ "$EVENT" = "schedule" ]; then')[1]?.split('elif [ "$EVENT" = "push" ]; then')[0] ?? '';
assert.equal((scheduledPlan.match(/topic=variety/g) ?? []).length, 2, 'both scheduled paths search the varied catalog');
assert.match(scheduledPlan, /action=scrape-and-prune-text/, 'Sunday cleanup does not rescreen the full catalog with Gemini');
assert.match(workflow, /SCRAPE_GEMINI_MIN_INTERVAL_MS:\s*'8000'/);
assert.match(workflow, /github\.event_name == 'schedule' && 'gemini-3\.5-flash-lite'/);
assert.match(workflow, /github\.event_name == 'schedule' && '7'/);
assert.deepEqual([...VARIETY_SCRAPE_TOPIC_IDS], [...EVERGREEN_SCRAPE_CATEGORY_IDS]);
const items = VARIETY_SCRAPE_TOPIC_IDS.flatMap((topic) => [{ id: `${topic}-1` }, { id: `${topic}-2` }]);
const topics = new Map(items.map((item) => [item.id, item.id.replace(/-[12]$/, '')]));
const selected = selectVarietyCandidates(items, topics, 10);
assert.equal(new Set(selected.map((item) => topics.get(item.id))).size, VARIETY_SCRAPE_TOPIC_IDS.length);
console.log('Daily scraper schedule and category selection checks passed.');
