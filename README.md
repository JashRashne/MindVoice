# MindVoice

**Privacy-Oriented On-Device AI Assistant with Local RAG**

[![CI](https://github.com/JashRashne/MindVoice/actions/workflows/ci.yml/badge.svg)](https://github.com/JashRashne/MindVoice/actions/workflows/ci.yml)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-v54-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![llama.rn](https://img.shields.io/badge/llama.rn-v0.11-FF6F00?logo=c%2B%2B&logoColor=white)](https://github.com/mybigday/llama.rn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MindVoice is an on-device React Native AI assistant that runs local LLM inference and embedding-based retrieval directly on mobile hardware. It combines `llama.rn`, SQLite, local GGUF models, and explicit cross-chat context selection to provide private-by-design conversational workflows without relying on cloud inference APIs.

---

## Architecture Overview

```text
React Native / Expo UI
        │
        ├──> SQLite Persistence (chats, messages, vectors via WAL mode)
        │
        ├──> Nomic Embed via llama.rn
        │       │
        │       └──> In-Memory Cosine Similarity Retrieval
        │
        └──> Qwen 2.5 1.5B GGUF via llama.rn
                │
                └──> Streamed Response Tokens (4 CPU threads)
```

<div align="center">
  <img src="https://res.cloudinary.com/dgbgxtsrl/image/upload/v1786878108/mindvoice_acziz9.png" alt="MindVoice Architecture Diagram" width="100%" />
</div>

---

## Engineering Highlights

### On-Device Inference
MindVoice integrates `llama.rn` to execute quantized GGUF weights directly on physical device CPUs using POSIX multi-threading (configured for 4 threads). Primary conversational inference is handled by **Qwen 2.5 1.5B Instruct** (Q4_K_M quantization, ~986 MB on disk), streaming tokens directly into React Native state.

### Local RAG & Vector Retrieval
User inputs are vectorized locally using **Nomic Embed Text v1.5** via `llama.rn`. Embeddings are stored alongside messages in SQLite and evaluated using dense cosine similarity:

$$\text{Cosine Similarity}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2} = \frac{\sum_{i=1}^d u_i v_i}{\sqrt{\sum_{i=1}^d u_i^2} \sqrt{\sum_{i=1}^d v_i^2}}$$

Retrieval queries rank stored chunk vectors with a similarity threshold filter ($s \ge 0.15$), and top results are formatted into standard ChatML prompt blocks. Users can explicitly reference past conversations via `@chat` chips, injecting contextual history directly into the current inference prompt.

### SQLite Persistence
Chat sessions, message histories, and generated embedding vectors are persisted locally using `expo-sqlite` with write-ahead logging (`PRAGMA journal_mode = WAL;`) enabled for fast transactional writes.

### Serialized Model Invocation Guard
`llama.rn` context instances are single-threaded state machines in native C++. Invoking secondary tasks (such as background 2–3 word chat title generation) concurrently with active streaming inference causes native runtime memory corruption or segmentation faults (`SIGSEGV`). MindVoice gates model invocations behind an application-level guard (`llamaBusy`), queuing or deferring non-critical requests until active completions finish.

### Async UI State Handling
Asynchronous retrieval across SQLite and embedding models incurs a 40–120 ms latency window. If a user quickly toggles `@chat` reference chips during vector search, standard React closures risk capturing stale state. MindVoice mirrors selection state to `selectedContextChatsRef` to keep asynchronous retrieval aligned with the latest user selection instead of relying on stale React closures.

### In-App Benchmark Suite
An integrated benchmark harness (`app/benchmark.tsx` and `utils/deviceBenchmark.ts`) evaluates cold model load latency, TTFT (time-to-first-token), token throughput, embedding speed, and retrieval recall directly on the user's mobile hardware.

---

## Hardware Benchmarks & Empirical Results

The repository includes both a built-in lightweight benchmark suite and separate stress-test evaluations run on physical mobile hardware.

- **Built-in Benchmark Harness**: Evaluates cold load, TTFT, sustained throughput, embedding speed, and Recall@1 / Recall@3 using a curated multi-turn labeled evaluation set (`LABELED_EVAL_DATASET`).
- **Extended Retrieval Stress Tests**: Evaluates exact cosine search latency across larger corpora (up to 5,000 vectors) and larger query evaluation sets.

### Verified Measurements

| Metric | Verified Result | Context |
|---|---:|---|
| **Generation throughput** | `14 tok/s` | Measured sustained throughput with Qwen 2.5 1.5B Q4_K_M (4 CPU threads) on physical mobile device |
| **Median TTFT** | `1.86 s` | Time-to-first-token latency from prompt submission under identical configuration |
| **Retrieval latency (p50)** | `279 ms` | Exact dense cosine similarity search over 5,000 stored embedding vectors |
| **Retrieval Recall@3** | `100%` | Top-3 chunk retrieval accuracy over 20-query hand-labeled evaluation set |
| **RAM footprint** | `< 2.5 GB` | Peak resident memory during local model execution on mid-tier hardware |
| **Model size** | `~986 MB` | Qwen 2.5 1.5B Instruct Q4_K_M GGUF file size |
| **Embedding model size** | `~150 MB` | Nomic Embed Text v1.5 Q4_K_M GGUF file size |
| **Embedding output dimension** | `384` | Nomic embedding vector dimension returned by runtime |
| **Context window** | `2,048 tokens` | Configured `llama.rn` context length (`n_ctx: 2048`) |

*Note: In local testing, generation throughput ranges from ~14 tok/s under sustained load up to ~18 tok/s in short bursts, depending on device thermal throttling and prompt complexity.*

---

## Engineering Trade-offs

| Area | Chosen Approach | Alternative Considered | Rationale |
|---|---|---|---|
| **Model Quantization** | Q4_K_M (1.5B parameters) | FP16 or Q8_0 | Fits comfortably within <2.5 GB RAM envelope on mid-tier devices while delivering sustained ~14 tok/s. |
| **Vector Storage** | SQLite (WAL mode) | Dedicated mobile Vector DB (LibSQL / sqlite-vec) | Zero extra native build dependencies; simple maintenance with negligible memory overhead (<5 MB). |
| **Retrieval Algorithm** | Exact cosine similarity | Approximate Nearest Neighbor (ANN / HNSW) | Exact retrieval yields 100% Recall@3 on tested corpora; 279 ms p50 at 5,000 vectors is acceptable for personal conversation scale. |
| **Cross-Chat Context** | Explicit `@chat` chips | Unconstrained global vector scan | Eliminates cross-chat semantic bleed and false-positive context retrieval; bounds search scope. |
| **Concurrency Management** | Serialized application guard (`llamaBusy`) | Multi-instance C++ contexts | Single context minimizes peak mobile memory overhead; serializing calls prevents native segmentation faults. |
| **Privacy Architecture** | Local on-device execution | Cloud inference API | AI inference and conversation logs remain strictly on-device without cloud API dependencies, bounded by local compute capability. |

---

## Project Structure

```text
MindVoice/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI (typecheck & lint)
├── app/
│   ├── _layout.tsx           # Navigation container & theme setup
│   ├── index.tsx             # Chat list view, avatar hashing & chat deletion
│   ├── benchmark.tsx         # On-device hardware benchmark screen
│   └── chat/
│       └── [id].tsx          # Chat screen, token streaming & @chat context bar
├── utils/
│   ├── database.ts           # Expo SQLite WAL client (chats, messages, vectors)
│   ├── deviceBenchmark.ts    # Automated TTFT, load, throughput & recall suite
│   ├── embeddings.ts         # Native Nomic Embed GGUF vectorization handler
│   ├── modelConfig.ts        # Model file paths & configuration labels
│   ├── rag.ts                # Context assembly, chunking & ChatML prompt builder
│   └── vectorStore.ts        # In-memory dense cosine similarity matcher
├── assets/                   # App icons and splash assets
├── app.json                  # Expo project configuration
├── eas.json                  # EAS build configurations
├── eslint.config.js          # ESLint configuration
├── metro.config.js           # Metro bundler config for asset extensions
├── package.json              # Project dependencies & scripts
├── package-lock.json         # Pinned dependency lockfile
├── tsconfig.json             # TypeScript compiler configuration
├── LICENSE                   # MIT License
└── README.md                 # Technical documentation
```

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm
- Android Studio with Android SDK & NDK configured (or Xcode for iOS development)
- Physical mobile device or emulator with at least 4 GB RAM
- Android Debug Bridge (`adb`) installed for model sideloading

> **Note**: `llama.rn` relies on native C++ compilation and cannot run inside standard Expo Go. You must use Expo prebuild or development builds (`npx expo run:android` / `npx expo run:ios`).

### Installation

```bash
# Clone the repository
git clone https://github.com/JashRashne/MindVoice.git
cd MindVoice

# Clean dependency installation
npm ci
```

### Static Validation & CI
Continuous integration validates static correctness on push and pull requests to `main`:

```bash
# Typecheck
npx tsc --noEmit

# Lint
npm run lint
```

*Note: CI validates JavaScript/TypeScript type correctness and code styling. Native inference execution requires physical device hardware and local model weights.*

### Model Setup (Android Example)

MindVoice requires two GGUF model files placed in the application's external files directory:
1. **Chat Model**: `qwen2.5-1.5b-instruct-q4_k_m.gguf` (renamed as `qwen2.5-1.5b-q4.gguf`, ~986 MB)
2. **Embedding Model**: `nomic-embed-text-v1.5.Q4_K_M.gguf` (renamed as `nomic-embed.gguf`, ~150 MB)

Transfer the models to your Android device using `adb`:

```bash
# Push chat model to app data folder
adb push qwen2.5-1.5b-instruct-q4_k_m.gguf /sdcard/Android/data/com.anonymous.MindVoice/files/qwen2.5-1.5b-q4.gguf

# Push embedding model to app data folder
adb push nomic-embed-text-v1.5.Q4_K_M.gguf /sdcard/Android/data/com.anonymous.MindVoice/files/nomic-embed.gguf
```

Paths are configurable in [`utils/modelConfig.ts`](utils/modelConfig.ts).

### Running the App

```bash
# Build and run on Android (development build)
npx expo run:android

# Build and run on iOS (development build)
npx expo run:ios
```

---

## Scope & Limitations

- **Hardware Dependency**: Inference performance scales directly with mobile SoC specifications (CPU core layout, thermal envelope, memory bandwidth).
- **Storage Footprint**: Quantized GGUF models require ~1.1 GB of local device storage.
- **Linear Retrieval Scaling**: In-memory cosine similarity search evaluates exhaustively ($O(N)$), which is optimal for small-to-medium personal chat histories but does not employ an indexed ANN structure (e.g., HNSW).
- **Serialized Execution**: Model calls are serialized at the application level; simultaneous actions (such as generating chat titles while actively streaming an answer) are queued or guarded to preserve native stability.
- **Thermal Throttling**: Extended continuous generation sessions may experience throughput degradation as mobile OS kernels throttle CPU frequencies under heat load.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
