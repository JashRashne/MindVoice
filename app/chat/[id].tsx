import { useLocalSearchParams, useRouter } from "expo-router";
import { initLlama, LlamaContext } from "llama.rn";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import {
  getAllChats,
  getEmbeddings,
  getMessages,
  saveEmbedding,
  saveMessage,
  updateChatName,
} from "../../utils/database";
import { embedText, loadEmbeddingModel } from "../../utils/embeddings";
import { CHAT_MODEL_PATH } from "../../utils/modelConfig";
import { cosineSimilarity } from "../../utils/vectorStore";

const AVATAR_COLORS = [
  "#FF8A80",
  "#FFB74D",
  "#FFD54F",
  "#A5D6A7",
  "#80DEEA",
  "#90CAF9",
  "#CE93D8",
  "#F48FB1",
];
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

type Message = {
  id: string;
  text: string;
  sender: "user" | "ai";
};

type Chat = {
  id: string;
  name: string;
};

let llamaInstance: LlamaContext | null = null;
let embeddingReady = false;
// Track if LLM is busy to prevent concurrent calls
let llamaBusy = false;

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const chatId = params.id as string;
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelStatus, setModelStatus] = useState("Loading...");
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [selectedContextChats, setSelectedContextChats] = useState<string[]>(
    [],
  );
  const [chatName, setChatName] = useState("New Chat");
  const flatListRef = useRef<FlatList>(null);
  const messageCountRef = useRef(0);
  // Use ref for selectedContextChats so retrieveContext always has latest value
  const selectedContextChatsRef = useRef<string[]>([]);
  const allChatsRef = useRef<Chat[]>([]);

  useEffect(() => {
    if (chatId) initialize();
  }, [chatId]);

  const initialize = async () => {
    try {
      if (!llamaInstance) {
        setModelStatus("Loading model...");
        llamaInstance = await initLlama({
          model: CHAT_MODEL_PATH,
          n_ctx: 2048,
          n_threads: 4,
        });
      }

      if (!embeddingReady) {
        setModelStatus("Loading memory...");
        await loadEmbeddingModel();
        embeddingReady = true;
      }

      const savedMessages = await getMessages(chatId);
      if (savedMessages.length > 0) {
        setMessages(
          savedMessages.map((m) => ({
            id: m.id,
            text: m.text,
            sender: m.sender as "user" | "ai",
          })),
        );
        messageCountRef.current = savedMessages.length;
      } else {
        setMessages([{ id: "welcome", text: "Hello.", sender: "ai" }]);
      }

      // Load all chats upfront so cross-referencing always works
      const chats = await getAllChats();
      const otherChats = chats.filter((c) => c.id !== chatId);
      setAllChats(otherChats);
      allChatsRef.current = otherChats;

      const current = chats.find((c) => c.id === chatId);
      if (current) setChatName(current.name);

      setIsModelLoading(false);
      setModelStatus("Ready");
    } catch (error) {
      setModelStatus(`Error: ${error}`);
      setIsModelLoading(false);
    }
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.endsWith("@")) {
      // Refresh chats list when @ is typed
      getAllChats().then((chats) => {
        const others = chats.filter((c) => c.id !== chatId);
        setAllChats(others);
        allChatsRef.current = others;
      });
      setShowAtPicker(true);
    } else if (showAtPicker && !text.includes("@")) {
      setShowAtPicker(false);
    }
  };

  const selectContextChat = (chat: Chat) => {
    if (!selectedContextChatsRef.current.includes(chat.id)) {
      const updated = [...selectedContextChatsRef.current, chat.id];
      selectedContextChatsRef.current = updated;
      setSelectedContextChats(updated);
    }
    setInputText((prev) => prev.replace(/@$/, `@${chat.name} `));
    setShowAtPicker(false);
  };

  const removeContextChat = (id: string) => {
    const updated = selectedContextChatsRef.current.filter((c) => c !== id);
    selectedContextChatsRef.current = updated;
    setSelectedContextChats(updated);
  };

  const retrieveContext = async (query: string): Promise<string> => {
    const queryVector = await embedText(query);
    const contextParts: string[] = [];

    // Current chat embeddings
    const currentEmbeddings = await getEmbeddings(chatId);
    const currentResults = currentEmbeddings
      .map((e) => ({
        text: e.chunk_text,
        score: cosineSimilarity(queryVector, e.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .filter((r) => r.score > 0.15)
      .slice(0, 3);

    if (currentResults.length > 0) {
      contextParts.push(
        "From current conversation:\n" +
          currentResults.map((r) => `- ${r.text}`).join("\n"),
      );
    }

    // Cross-referenced chats — user explicitly @-mentioned these, so always include
    // top results regardless of similarity score (no threshold filter)
    for (const contextChatId of selectedContextChatsRef.current) {
      const embeddings = await getEmbeddings(contextChatId);
      if (embeddings.length === 0) continue;

      const results = embeddings
        .map((e) => ({
          text: e.chunk_text,
          score: cosineSimilarity(queryVector, e.vector),
        }))
        .filter((r) => isFinite(r.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // Use ref to get latest allChats value
      const chat = allChatsRef.current.find((c) => c.id === contextChatId);
      if (results.length > 0 && chat) {
        contextParts.push(
          `From @${chat.name}:\n` +
            results.map((r) => `- ${r.text}`).join("\n"),
        );
      }
    }

    return contextParts.join("\n\n");
  };

  // Auto-name runs AFTER main completion to avoid LLM conflict
  const autoNameChat = async (firstUserMessage: string) => {
    if (!llamaInstance || llamaBusy) return;
    try {
      llamaBusy = true;
      const result = await llamaInstance.completion({
        prompt: `<|im_start|>system\nGive a short 2-3 word name for a chat. Reply with ONLY the name, no punctuation.\n<|im_end|>\n<|im_start|>user\n${firstUserMessage}\n<|im_end|>\n<|im_start|>assistant\n`,
        n_predict: 10,
        temperature: 0.3,
        stop: ["<|im_end|>", "\n"],
      });
      const name = result.text.trim().slice(0, 30);
      if (name) {
        await updateChatName(chatId, name);
        setChatName(name);
      }
    } catch (e) {
      console.log("Auto-name failed:", e);
    } finally {
      llamaBusy = false;
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isGenerating || !llamaInstance || llamaBusy)
      return;

    const userText = inputText.trim();
    const isFirstMessage = messageCountRef.current === 0;

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), text: userText, sender: "user" },
    ]);
    setInputText("");
    setIsGenerating(true);

    await saveMessage(chatId, userText, "user");
    try {
      const userVector = await embedText(userText);
      await saveEmbedding(chatId, userText, userVector);
    } catch (e) {}

    messageCountRef.current += 1;

    const aiMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, text: "", sender: "ai" },
    ]);

    try {
      const context = await retrieveContext(userText);
      const recentMessages = messages.slice(-20);

      const prompt = `<|im_start|>system\nYou are a direct, practical personal assistant. Today is ${new Date().toDateString()}.\nRules you must follow without exception:\n- ALWAYS give a concrete answer. Never refuse, never say "I can't", never say "I don't know" alone.\n- If you are uncertain, give your best estimate and label it: e.g. "roughly 400 kcal", "approximately 2 hours".\n- For nutrition, fitness, health, or any estimation task: use typical/average values and reason through it step by step.\n- BE SURE TO READ THE MESSAGE SENT BY THE USER PROPERLY. DO NOT HALLUCINATE.\n- Be concise. No disclaimers, no "consult a professional", no hedging paragraphs.\n- Use the memories and conversation history below to personalize answers.\n${context ? `\nRelevant memories:\n${context}` : ""}\n<|im_end|>\n${recentMessages.map((m) => `<|im_start|>${m.sender === "user" ? "user" : "assistant"}\n${m.text}\n<|im_end|>`).join("\n")}\n<|im_start|>user\n${userText}\n<|im_end|>\n<|im_start|>assistant\n`;

      console.log(prompt);

      let fullResponse = "";
      llamaBusy = true;

      await llamaInstance.completion(
        {
          prompt,
          n_predict: 300,
          temperature: 0.7,
          stop: ["<|im_end|>", "<|im_start|>"],
        },
        (data) => {
          fullResponse += data.token;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, text: msg.text + data.token }
                : msg,
            ),
          );
        },
      );

      llamaBusy = false;

      await saveMessage(chatId, fullResponse, "ai");
      try {
        const aiVector = await embedText(fullResponse);
        await saveEmbedding(chatId, fullResponse, aiVector);
      } catch (e) {}

      // Auto-name AFTER main completion is fully done
      if (isFirstMessage) {
        autoNameChat(userText);
      }

      // Clear selected context chats after sending
      selectedContextChatsRef.current = [];
      setSelectedContextChats([]);
    } catch (error) {
      llamaBusy = false;
      console.log("Completion error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, text: "Something went wrong." }
            : msg,
        ),
      );
    }

    setIsGenerating(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {chatName}
        </Text>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isModelLoading ? "#F59E0B" : "#22C55E" },
            ]}
          />
          <Text style={styles.statusText}>
            {isModelLoading ? "Loading" : "Ready"}
          </Text>
        </View>
      </View>

      {/* Messages */}
      {isModelLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#0A0A0A" size="large" />
          <Text style={styles.loadingTitle}>{modelStatus}</Text>
          <Text style={styles.loadingSubtitle}>This only happens once</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.sender === "user" ? (
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{item.text}</Text>
              </View>
            ) : (
              <View style={styles.aiRow}>
                <View style={styles.aiAvatar}>
                  <Text style={styles.aiAvatarText}>M</Text>
                </View>
                <View style={styles.aiBubble}>
                  {item.text ? (
                    <Markdown style={markdownStyles}>{item.text}</Markdown>
                  ) : (
                    <View style={styles.typingIndicator}>
                      <ActivityIndicator size="small" color="#AEAEB2" />
                    </View>
                  )}
                </View>
              </View>
            )
          }
        />
      )}

      {/* Inline @ Picker — slides in above input, no modal needed */}
      {showAtPicker && (
        <View style={styles.atPickerContainer}>
          <Text style={styles.atPickerLabel}>Reference a chat</Text>
          {allChats.length === 0 ? (
            <Text style={styles.atPickerEmpty}>No other chats yet</Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {allChats.map((chat, index) => (
                <TouchableOpacity
                  key={chat.id}
                  style={[
                    styles.atPickerRow,
                    index === allChats.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => selectContextChat(chat)}
                >
                  <View
                    style={[
                      styles.atPickerAvatar,
                      { backgroundColor: getAvatarColor(chat.id) },
                    ]}
                  >
                    <Text style={styles.atPickerAvatarText}>
                      {chat.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.atPickerRowText}>{chat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Input Area */}
      <View style={styles.inputArea}>
        {selectedContextChats.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 16,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {selectedContextChats.map((id) => {
              const chat = allChatsRef.current.find((c) => c.id === id);
              return chat ? (
                <TouchableOpacity
                  key={id}
                  style={styles.chip}
                  onPress={() => removeContextChat(id)}
                >
                  <Text style={styles.chipLabel}>@{chat.name}</Text>
                  <Text style={styles.chipRemove}> ×</Text>
                </TouchableOpacity>
              ) : null;
            })}
          </ScrollView>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#C7C7CC"
            value={inputText}
            onChangeText={handleInputChange}
            multiline
            editable={!isModelLoading}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() || isGenerating || isModelLoading) &&
                styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isGenerating || isModelLoading}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F7F5" },

  // ── Header ──────────────────────────────────────────────────
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  backIcon: { fontSize: 18, color: "#0A0A0A" },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "serif",
    color: "#0A0A0A",
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F2F2F7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "serif", color: "#6E6E73" },

  // ── Loading ─────────────────────────────────────────────────
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8F7F5",
  },
  loadingTitle: { fontSize: 17, fontFamily: "serif", color: "#0A0A0A" },
  loadingSubtitle: { fontSize: 13, fontFamily: "serif", color: "#AEAEB2" },

  // ── Messages ────────────────────────────────────────────────
  list: { paddingHorizontal: 16, paddingVertical: 20, gap: 16 },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#0A0A0A",
    borderRadius: 20,
    borderBottomRightRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 11,
    maxWidth: "76%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userText: {
    fontSize: 16,
    fontFamily: "serif",
    color: "#FFFFFF",
    lineHeight: 23,
  },
  aiRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    maxWidth: "88%",
  },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0A0A0A",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    flexShrink: 0,
  },
  aiAvatarText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontFamily: "serif",
    fontWeight: "700",
  },
  aiBubble: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  typingIndicator: { paddingVertical: 6 },

  // ── @ Picker ────────────────────────────────────────────────
  atPickerContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    maxHeight: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 6,
  },
  atPickerLabel: {
    fontSize: 11,
    fontFamily: "serif",
    color: "#AEAEB2",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  atPickerEmpty: {
    fontSize: 14,
    fontFamily: "serif",
    color: "#C7C7CC",
    paddingVertical: 12,
  },
  atPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F2F7",
  },
  atPickerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  atPickerAvatarText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontFamily: "serif",
    fontWeight: "700",
  },
  atPickerRowText: { fontSize: 15, fontFamily: "serif", color: "#0A0A0A" },

  // ── Input Area ──────────────────────────────────────────────
  inputArea: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
    paddingBottom: 28,
  },
  chipsScroll: { paddingTop: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF0FF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: { fontSize: 13, fontFamily: "serif", color: "#5B52E0" },
  chipRemove: { fontSize: 13, fontFamily: "serif", color: "#9B95EA" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 16,
    color: "#0A0A0A",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0A0A0A",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: "#D1D1D6",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendIcon: { fontSize: 18, color: "#FFFFFF", fontWeight: "700" },
});

const markdownStyles = {
  body: { fontSize: 16, fontFamily: "serif", color: "#0a0a0a", lineHeight: 24 },
  paragraph: { marginBottom: 8, marginTop: 0 },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  code_inline: {
    fontFamily: "monospace",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 14,
  },
  fence: {
    backgroundColor: "#f7f7f7",
    padding: 12,
    borderRadius: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  heading1: {
    fontSize: 22,
    fontFamily: "serif",
    fontWeight: "700" as const,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 19,
    fontFamily: "serif",
    fontWeight: "700" as const,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 17,
    fontFamily: "serif",
    fontWeight: "600" as const,
    marginBottom: 4,
  },
};
