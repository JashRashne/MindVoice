import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createChat, deleteChat, getAllChats } from "../utils/database";

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
function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "C";
}

type Chat = {
  id: string;
  name: string;
  created_at: number;
  last_message_at: number;
};

export default function Index() {
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, []),
  );

  const loadChats = async () => {
    const allChats = await getAllChats();
    setChats(allChats);
  };

  const startNewChat = async () => {
    const chatId = await createChat();
    router.push(`/chat/${chatId}`);
  };

  const confirmDelete = (chatId: string, chatName: string) => {
    Alert.alert("Delete", `Delete "${chatName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteChat(chatId);
          loadChats();
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F7F5" />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerEyebrow}>Your space</Text>
          <Text style={styles.headerTitle}>MindVoice</Text>
        </View>
        <TouchableOpacity
          style={styles.benchmarkButton}
          onPress={() => router.push("./benchmark")}
        >
          <Text style={styles.benchmarkButtonText}>Benchmark</Text>
        </TouchableOpacity>
      </View>

      {chats.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIconText}>✦</Text>
          </View>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the button below to begin
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/chat/${item.id}`)}
              onLongPress={() => confirmDelete(item.id, item.name)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getAvatarColor(item.id) },
                ]}
              >
                <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowDate}>
                  {formatDate(item.last_message_at)}
                </Text>
              </View>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={startNewChat}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F7F5" },

  header: {
    paddingTop: 64,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: "#F8F7F5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: { flex: 1 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: "serif",
    color: "#AEAEB2",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 36,
    fontFamily: "serif",
    color: "#0A0A0A",
    letterSpacing: -1,
    fontWeight: "700",
  },
  benchmarkButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: "#E9E9ED",
  },
  benchmarkButtonText: {
    fontSize: 12,
    color: "#333",
    fontWeight: "700",
  },

  listContent: { paddingTop: 8, paddingBottom: 120 },

  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingBottom: 120,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EFEFEF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyIconText: { fontSize: 28, color: "#AEAEB2" },
  emptyTitle: {
    fontSize: 19,
    fontFamily: "serif",
    color: "#0A0A0A",
    fontWeight: "600",
  },
  emptySubtitle: { fontSize: 14, fontFamily: "serif", color: "#AEAEB2" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    gap: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 19,
    fontFamily: "serif",
    color: "#FFFFFF",
    fontWeight: "700",
  },
  rowContent: { flex: 1, gap: 3 },
  rowName: { fontSize: 16, fontFamily: "serif", color: "#0A0A0A" },
  rowDate: { fontSize: 12, fontFamily: "serif", color: "#AEAEB2" },
  rowChevron: { fontSize: 22, color: "#D1D1D6" },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ECECEC",
    marginLeft: 80,
  },

  fab: {
    position: "absolute",
    bottom: 36,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0A0A0A",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 30,
    color: "#FFFFFF",
    lineHeight: 34,
    marginTop: -2,
  },
});
