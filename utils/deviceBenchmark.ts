import { initLlama, LlamaContext } from "llama.rn";
import { embedText, loadEmbeddingModel } from "./embeddings";
import { CHAT_MODEL_PATH } from "./modelConfig";
import { cosineSimilarity } from "./vectorStore";

export interface BenchmarkMetrics {
  coldLoadMs: number;
  embeddingThroughputPerSec: number;
  recallAt1: number;
  recallAt3: number;
  meanCosineSimilarity: number;
  ttftMs: number;
  tokensPerSec: number;
  totalTokens: number;
  generationDurationMs: number;
  timestamp: string;
}

export const LABELED_EVAL_DATASET = [
  {
    query: "How did I feel after the meeting with Alex yesterday?",
    targetChunk: "Met Alex at 2 PM to discuss the Q3 roadmap. Felt overwhelmed and anxious about tight deadlines.",
    distractors: [
      "Had avocado toast and black coffee for breakfast.",
      "Finished reading chapter 4 of Atomic Habits before bed.",
      "Went for a 5km evening jog around the park in 26 minutes.",
    ],
  },
  {
    query: "What breathing exercise helps when I panic?",
    targetChunk: "Practiced 4-7-8 box breathing: inhale for 4 seconds, hold for 7, exhale slowly for 8 seconds to reset the nervous system.",
    distractors: [
      "Bought groceries: almond milk, bananas, and oats.",
      "Submitted the quarterly financial expense report to accounting.",
      "Cleaned the kitchen counters and vacuumed the living room.",
    ],
  },
  {
    query: "What was my sleep score on Tuesday night?",
    targetChunk: "Sleep tracker showed 6 hours 15 minutes of sleep with a score of 68; woke up twice feeling dehydrated.",
    distractors: [
      "Watered the balcony plants and trimmed the basil leaves.",
      "Scheduled dentist appointment for next Thursday morning.",
      "Listened to a podcast episode on cognitive reframing.",
    ],
  },
  {
    query: "What grounding technique did Sarah recommend?",
    targetChunk: "Sarah suggested the 5-4-3-2-1 sensory grounding technique: notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.",
    distractors: [
      "Ordered replacement running shoes online with discount code.",
      "Configured git rebase workflow for the mobile app repository.",
      "Baked sourdough bread on Sunday morning with whole wheat flour.",
    ],
  },
  {
    query: "What triggered my stress on Friday evening?",
    targetChunk: "Friday evening stress was triggered by an urgent Slack ping from leadership regarding the production release blocker.",
    distractors: [
      "Watched an episode of a nature documentary on marine ecosystems.",
      "Prepared chamomile tea with honey to wind down at 10 PM.",
      "Took a 15-minute stretch break focusing on neck and lower back relief.",
    ],
  },
];

export async function runDeviceBenchmarkSuite(
  onProgress?: (stage: string, progress: number) => void,
): Promise<BenchmarkMetrics> {
  // Phase 1: Embedding Model Cold Load & Vectorization
  onProgress?.("Loading embedding model...", 0.1);
  const loadStart = Date.now();
  await loadEmbeddingModel();
  const coldLoadMs = Date.now() - loadStart;

  onProgress?.("Evaluating retrieval recall...", 0.3);
  let correctAt1 = 0;
  let correctAt3 = 0;
  let totalCosine = 0;
  let comparisonCount = 0;

  for (let i = 0; i < LABELED_EVAL_DATASET.length; i++) {
    const item = LABELED_EVAL_DATASET[i];
    const queryVec = await embedText(item.query);
    const targetVec = await embedText(item.targetChunk);

    const candidates = [
      { text: item.targetChunk, vec: targetVec, isTarget: true },
    ];

    for (const dist of item.distractors) {
      const distVec = await embedText(dist);
      candidates.push({ text: dist, vec: distVec, isTarget: false });
    }

    const scored = candidates
      .map((c) => ({
        isTarget: c.isTarget,
        score: cosineSimilarity(queryVec, c.vec),
      }))
      .sort((a, b) => b.score - a.score);

    totalCosine += scored[0].score;
    comparisonCount++;

    if (scored[0].isTarget) correctAt1++;
    if (scored.slice(0, 3).some((c) => c.isTarget)) correctAt3++;

    onProgress?.("Evaluating retrieval recall...", 0.3 + (i / LABELED_EVAL_DATASET.length) * 0.3);
  }

  const recallAt1 = correctAt1 / LABELED_EVAL_DATASET.length;
  const recallAt3 = correctAt3 / LABELED_EVAL_DATASET.length;
  const meanCosineSimilarity = comparisonCount > 0 ? totalCosine / comparisonCount : 0;
  const embeddingThroughputPerSec = (LABELED_EVAL_DATASET.length * 4) / ((Date.now() - loadStart) / 1000);

  // Phase 2: LLM Initialization & Streaming Generation
  onProgress?.("Initializing Qwen 2.5 1.5B context...", 0.65);
  const llama: LlamaContext = await initLlama({
    model: CHAT_MODEL_PATH,
    n_ctx: 2048,
    n_threads: 4,
  });

  onProgress?.("Running inference benchmark...", 0.8);
  const prompt = "<|im_start|>system\nYou are a concise mental wellness coach.<|im_end|>\n<|im_start|>user\nShare three actionable strategies to manage acute situational anxiety.<|im_end|>\n<|im_start|>assistant\n";

  let firstTokenTimestamp: number | null = null;
  let tokenCount = 0;
  const genStart = Date.now();

  await llama.completion(
    {
      prompt,
      n_predict: 128,
      temperature: 0.7,
      stop: ["<|im_end|>"],
    },
    () => {
      if (!firstTokenTimestamp) {
        firstTokenTimestamp = Date.now();
      }
      tokenCount++;
    },
  );

  const genEnd = Date.now();
  const ttftMs = firstTokenTimestamp ? firstTokenTimestamp - genStart : 0;
  const generationDurationMs = genEnd - (firstTokenTimestamp || genStart);
  const tokensPerSec = generationDurationMs > 0 ? (tokenCount / (generationDurationMs / 1000)) : 0;

  onProgress?.("Benchmark complete!", 1.0);

  return {
    coldLoadMs,
    embeddingThroughputPerSec: parseFloat(embeddingThroughputPerSec.toFixed(2)),
    recallAt1: parseFloat((recallAt1 * 100).toFixed(1)),
    recallAt3: parseFloat((recallAt3 * 100).toFixed(1)),
    meanCosineSimilarity: parseFloat(meanCosineSimilarity.toFixed(3)),
    ttftMs,
    tokensPerSec: parseFloat(tokensPerSec.toFixed(2)),
    totalTokens: tokenCount,
    generationDurationMs,
    timestamp: new Date().toISOString(),
  };
}
