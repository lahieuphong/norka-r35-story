export interface StoryProgressSnapshot {
  readonly progress: number;
  readonly current: number;
  readonly total: number;
}

type StoryProgressListener = (snapshot: StoryProgressSnapshot) => void;

let snapshot: StoryProgressSnapshot = { progress: 0, current: 1, total: 12 };
const listeners = new Set<StoryProgressListener>();

export function publishStoryProgress(progress: number, current: number, total: number): void {
  const safeTotal = Math.max(1, Math.round(total));
  snapshot = {
    progress: Math.min(1, Math.max(0, progress)),
    current: Math.min(safeTotal, Math.max(1, Math.round(current))),
    total: safeTotal,
  };
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribeStoryProgress(listener: StoryProgressListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}
