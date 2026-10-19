/**
 * Pinned GGUF files.
 *
 * Sizes and SHA-256 values are the Hugging Face LFS oids for these revisions.
 * `main` is not used: a branch tip can move, a revision cannot.
 */

export type ScrapModelPin = {
  id: string;
  filename: string;
  revision: string;
  url: string;
  bytes: number;
  sha256: string;
};

export const SCRAP_MODEL_FILENAME = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';

/** bartowski/Qwen2.5-1.5B-Instruct-GGUF @ 9eadc66189c7641e1ddd226b8267a9119b2ce2d4 */
export const SCRAP_MODEL_PIN: ScrapModelPin = {
  id: 'qwen2.5-1.5b-instruct-q4_k_m',
  filename: SCRAP_MODEL_FILENAME,
  revision: '9eadc66189c7641e1ddd226b8267a9119b2ce2d4',
  url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/9eadc66189c7641e1ddd226b8267a9119b2ce2d4/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  bytes: 986048768,
  sha256: '1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370',
};

/**
 * Smaller comparison candidate. The sheet does not download this file.
 * Device logs are required before calling it faster or better.
 *
 * bartowski/Qwen2.5-0.5B-Instruct-GGUF @ 41ba88dbac95fed2528c92514c131d73eb5a174b
 */
export const SCRAP_COMPARISON_MODEL_PIN: ScrapModelPin = {
  id: 'qwen2.5-0.5b-instruct-q4_k_m',
  filename: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
  revision: '41ba88dbac95fed2528c92514c131d73eb5a174b',
  url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/41ba88dbac95fed2528c92514c131d73eb5a174b/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
  bytes: 397808192,
  sha256: '6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653',
};

export const LOCAL_AI_ENGINE_LABEL = 'Download Local AI Engine (986 MB)';

/**
 * Qwen2.5-VL 3B Instruct. The language file cannot see a photo.
 * Analysis also requires the projector converted with that same file.
 */
export type VisionModelPair = {
  platform: 'ios' | 'android';
  text: ScrapModelPin;
  projector: ScrapModelPin;
};

/** ggml-org/Qwen2.5-VL-3B-Instruct-GGUF @ 5037fcf163dd95d1e41d1974465f0898ed108ca2 */
const IOS_VISION_REVISION = '5037fcf163dd95d1e41d1974465f0898ed108ca2';
const IOS_VISION_BASE = `https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/${IOS_VISION_REVISION}`;

export const IOS_VISION_TEXT_PIN: ScrapModelPin = {
  id: 'qwen2.5-vl-3b-instruct-q4-k-m',
  filename: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
  revision: IOS_VISION_REVISION,
  url: `${IOS_VISION_BASE}/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf`,
  bytes: 1929901056,
  sha256: 'd02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12',
};

export const IOS_VISION_PROJECTOR_PIN: ScrapModelPin = {
  id: 'qwen2.5-vl-3b-instruct-mmproj-q8-0',
  filename: 'mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
  revision: IOS_VISION_REVISION,
  url: `${IOS_VISION_BASE}/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf`,
  bytes: 844757728,
  sha256: '980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904',
};

/** unsloth/Qwen2.5-VL-3B-Instruct-GGUF @ 20ce64893974f3faa729fe3dbdd70f8cabc2523c */
const ANDROID_VISION_REVISION = '20ce64893974f3faa729fe3dbdd70f8cabc2523c';
const ANDROID_VISION_BASE = `https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/${ANDROID_VISION_REVISION}`;

export const ANDROID_VISION_TEXT_PIN: ScrapModelPin = {
  id: 'qwen2.5-vl-3b-instruct-q4-0',
  filename: 'Qwen2.5-VL-3B-Instruct-Q4_0.gguf',
  revision: ANDROID_VISION_REVISION,
  url: `${ANDROID_VISION_BASE}/Qwen2.5-VL-3B-Instruct-Q4_0.gguf`,
  bytes: 1828484448,
  sha256: 'b7bbe51de4b0880be2b6b0c6891bc8e6666e4e535bdc65c78dcbd475d6824b4d',
};

export const ANDROID_VISION_PROJECTOR_PIN: ScrapModelPin = {
  id: 'qwen2.5-vl-3b-instruct-mmproj-f16',
  filename: 'mmproj-F16.gguf',
  revision: ANDROID_VISION_REVISION,
  url: `${ANDROID_VISION_BASE}/mmproj-F16.gguf`,
  bytes: 1338428256,
  sha256: '4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c',
};

/** Files from the smaller Android trial. Removed so they are not hashed again. */
export const OBSOLETE_ANDROID_VISION_FILENAMES = [
  'SmolVLM-500M-Instruct-Q8_0.gguf',
  'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
] as const;

export const IOS_VISION_PAIR: VisionModelPair = {
  platform: 'ios',
  text: IOS_VISION_TEXT_PIN,
  projector: IOS_VISION_PROJECTOR_PIN,
};

export const ANDROID_VISION_PAIR: VisionModelPair = {
  platform: 'android',
  text: ANDROID_VISION_TEXT_PIN,
  projector: ANDROID_VISION_PROJECTOR_PIN,
};

/** Metal 3B on iOS, OpenCL Q4_0 3B on Android. Other platforms have no vision pair. */
export function visionModelPair(platform: string): VisionModelPair | null {
  if (platform === 'ios') return IOS_VISION_PAIR;
  if (platform === 'android') return ANDROID_VISION_PAIR;
  return null;
}

/** Extra free space required beyond the file itself. */
export const SCRAP_MODEL_STORAGE_MARGIN_BYTES = 64 * 1024 * 1024;

export const SCRAP_HASH_CHUNK_BYTES = 1024 * 1024;
