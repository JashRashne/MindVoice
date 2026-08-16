export type VectorEntry = {
  id: string;
  text: string;
  vector: number[];
  score?: number;
  metadata?: Record<string, any>;
};

const vectorStore: VectorEntry[] = [];

export function addEntry(
  text: string,
  vector: number[],
  metadata?: Record<string, any>,
) {
  const entry: VectorEntry = {
    id: Date.now().toString(),
    text,
    vector,
    metadata,
  };
  vectorStore.push(entry);
  return entry;
}

export function search(queryVector: number[], topK: number = 3): VectorEntry[] {
  return vectorStore
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryVector, entry.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

export function getAll(): VectorEntry[] {
  return vectorStore;
}

export function clear() {
  vectorStore.length = 0;
}
