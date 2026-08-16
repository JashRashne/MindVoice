import AsyncStorage from "@react-native-async-storage/async-storage";
import { embedText } from "./embeddings";
import { addEntry, search, VectorEntry } from "./vectorStore";

const VECTOR_STORE_KEY = "mindvoice_vector_store";
const CHAT_HISTORY_KEY = "mindvoice_chat_history";

// ─── Persistence ────────────────────────────────────────────

export async function saveVectorStore(entries: VectorEntry[]) {
  await AsyncStorage.setItem(VECTOR_STORE_KEY, JSON.stringify(entries));
}

export async function loadVectorStore() {
  const data = await AsyncStorage.getItem(VECTOR_STORE_KEY);
  if (!data) return;

  const entries: VectorEntry[] = JSON.parse(data);
  for (const entry of entries) {
    addEntry(entry.text, entry.vector, entry.metadata);
  }
  console.log(`Loaded ${entries.length} entries from storage`);
}

export async function saveChatHistory(messages: any[]) {
  await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
}

export async function loadChatHistory(): Promise<any[]> {
  const data = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

// ─── Journal ─────────────────────────────────────────────────

export async function addJournalEntry(text: string) {
  const chunks = chunkText(text);
  const newEntries: VectorEntry[] = [];

  for (const chunk of chunks) {
    const vector = await embedText(chunk);
    const entry = addEntry(chunk, vector, {
      type: "journal",
      date: new Date().toISOString(),
      fullText: text,
    });
    newEntries.push(entry);
  }

  const { getAll } = require("./vectorStore");
  await saveVectorStore(getAll());
  return newEntries;
}

function chunkText(text: string, chunkSize: number = 150): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }

  return chunks.filter((c) => c.trim().length > 0);
}

// ─── RAG Pipeline ─────────────────────────────────────────────

export async function retrieveRelevantContext(
  query: string,
  topK: number = 3,
): Promise<string> {
  const queryVector = await embedText(query);
  const results = search(queryVector, topK);

  if (results.length === 0) return "";
  const relevant = results.filter((r) => (r.score ?? 0) > 0.4);
  if (relevant.length === 0) return "";

  const context = relevant.map((r) => `- ${r.text}`).join("\n");
  return context;
}

export function buildRAGPrompt(userMessage: string, context: string): string {
  const date = new Date().toDateString();

  if (context) {
    return `<|im_start|>system\nYou are MindVoice, a compassionate mental wellness companion. Today's date is ${date}.\nYou have access to the user's journal entries below. Use them to give personalized, empathetic responses.\nReference specific entries when relevant but don't quote them verbatim.\n\nRelevant journal context:\n${context}\n<|im_end|>\n<|im_start|>user\n${userMessage}\n<|im_end|>\n<|im_start|>assistant\n`;
  }

  return `<|im_start|>system\nYou are MindVoice, a compassionate mental wellness companion. Today's date is ${date}.\nRespond with empathy and keep responses concise.\n<|im_end|>\n<|im_start|>user\n${userMessage}\n<|im_end|>\n<|im_start|>assistant\n`;
}
