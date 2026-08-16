import { initLlama, LlamaContext } from "llama.rn";
import { cosineSimilarity } from "./vectorStore";
import { EMBEDDING_MODEL_PATH } from "./modelConfig";

let embedContext: LlamaContext | null = null;

export async function loadEmbeddingModel() {
  if (embedContext) return embedContext;

  console.log("Loading nomic-embed-text...");
  embedContext = await initLlama({
    model: EMBEDDING_MODEL_PATH,
    n_ctx: 512,
    n_threads: 4,
    embedding: true,
  });

  console.log("Embedding model loaded!");
  return embedContext;
}

export async function embedText(text: string): Promise<number[]> {
  if (!embedContext) {
    await loadEmbeddingModel();
  }

  const result = await embedContext!.embedding(text);
  return result.embedding;
}

export { cosineSimilarity };
