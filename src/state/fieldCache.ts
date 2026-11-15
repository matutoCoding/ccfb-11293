// ---------- 应力场缓存: 同一样品未修改时不重算 ----------
import type { Sample, StressField } from '../types';
import { computeStressField } from '../physics/stress';
import { store } from '../state/store';

const cache = new Map<string, { key: string; field: StressField }>();

export function getField(sample: Sample): StressField {
  const key = `${sample.updatedAt}:${store.settings.gridResolution}`;
  const hit = cache.get(sample.id);
  if (hit && hit.key === key) return hit.field;
  const field = computeStressField(sample, store.settings.gridResolution);
  cache.set(sample.id, { key, field });
  return field;
}

export function invalidateField(sampleId: string): void {
  cache.delete(sampleId);
}
