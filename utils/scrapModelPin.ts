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

/** Extra free space required beyond the file itself. */
export const SCRAP_MODEL_STORAGE_MARGIN_BYTES = 64 * 1024 * 1024;

export const SCRAP_HASH_CHUNK_BYTES = 1024 * 1024;
