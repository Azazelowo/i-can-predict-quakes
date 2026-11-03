import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DataBundle } from '../../src/core/types';

const dataDir = fileURLToPath(new URL('../../public/data/', import.meta.url));

let cached: DataBundle | null = null;

/** 測試用：直接讀 public/data/*.json（只讀一次）。 */
export function loadTestData(): DataBundle {
  if (cached) return cached;
  const read = (name: string) => JSON.parse(readFileSync(dataDir + name, 'utf8'));
  cached = {
    catalog: read('catalog.json'),
    felt: read('felt.json'),
    map: read('map.json'),
    meta: read('meta.json'),
  };
  return cached;
}
