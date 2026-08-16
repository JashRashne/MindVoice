import { useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BenchmarkMetrics, runDeviceBenchmarkSuite } from "../utils/deviceBenchmark";

export default function BenchmarkScreen() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [stage, setStage] = useState("Ready to benchmark");
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState<BenchmarkMetrics | null>(null);

  const handleRunBenchmark = async () => {
    try {
      setIsRunning(true);
      await activateKeepAwakeAsync();
      const result = await runDeviceBenchmarkSuite((currentStage, currentProgress) => {
        setStage(currentStage);
        setProgress(currentProgress);
      });
      setMetrics(result);
    } catch (error) {
      Alert.alert("Benchmark Error", String(error));
    } finally {
      setIsRunning(false);
      deactivateKeepAwake();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>On-Device Benchmark</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Local Model Performance Harness</Text>
          <Text style={styles.infoSubtitle}>
            Measures cold load time, embedding throughput, retrieval Recall@1/3, Time-To-First-Token (TTFT), and generation speed on this physical device.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.runButton, isRunning && styles.runButtonDisabled]}
          onPress={handleRunBenchmark}
          disabled={isRunning}
        >
          {isRunning ? (
            <View style={styles.runningRow}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.runButtonText}>Running... {Math.round(progress * 100)}%</Text>
            </View>
          ) : (
            <Text style={styles.runButtonText}>Run Benchmark Suite</Text>
          )}
        </TouchableOpacity>

        {isRunning && (
          <View style={styles.progressCard}>
            <Text style={styles.progressStage}>{stage}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>
        )}

        {metrics && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsHeader}>Results Summary</Text>

            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Recall @ 1</Text>
                <Text style={styles.metricValue}>{metrics.recallAt1}%</Text>
                <Text style={styles.metricSub}>Top match accuracy</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Recall @ 3</Text>
                <Text style={styles.metricValue}>{metrics.recallAt3}%</Text>
                <Text style={styles.metricSub}>Top-3 retrieval</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>TTFT</Text>
                <Text style={styles.metricValue}>{metrics.ttftMs} ms</Text>
                <Text style={styles.metricSub}>Time to first token</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Throughput</Text>
                <Text style={styles.metricValue}>{metrics.tokensPerSec}</Text>
                <Text style={styles.metricSub}>Tokens / second</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Cold Load</Text>
                <Text style={styles.metricValue}>{metrics.coldLoadMs} ms</Text>
                <Text style={styles.metricSub}>Embedding startup</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Mean Cosine</Text>
                <Text style={styles.metricValue}>{metrics.meanCosineSimilarity}</Text>
                <Text style={styles.metricSub}>Score confidence</Text>
              </View>
            </View>

            <View style={styles.rawCard}>
              <Text style={styles.rawLabel}>Raw JSON Report</Text>
              <Text style={styles.rawCode}>{JSON.stringify(metrics, null, 2)}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F7F5" },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: "#000" },
  headerTitle: { fontSize: 17, fontWeight: "600", marginLeft: 8, color: "#000" },
  content: { padding: 20, gap: 16 },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  infoTitle: { fontSize: 17, fontWeight: "700", color: "#0A0A0A", marginBottom: 6 },
  infoSubtitle: { fontSize: 14, color: "#6C6C70", lineHeight: 20 },
  runButton: {
    backgroundColor: "#0A0A0A",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  runningRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  progressStage: { fontSize: 14, color: "#3A3A3C", fontWeight: "500" },
  progressBarBg: { height: 8, backgroundColor: "#E5E5EA", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#0A0A0A", borderRadius: 4 },
  resultsContainer: { gap: 14 },
  resultsHeader: { fontSize: 20, fontWeight: "700", color: "#0A0A0A", marginTop: 8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    gap: 4,
  },
  metricLabel: { fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: "600" },
  metricValue: { fontSize: 24, fontWeight: "800", color: "#0A0A0A" },
  metricSub: { fontSize: 12, color: "#6C6C70" },
  rawCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  rawLabel: { fontSize: 12, color: "#8E8E93", fontWeight: "700", marginBottom: 8, textTransform: "uppercase" },
  rawCode: { fontFamily: "monospace", fontSize: 12, color: "#30D158", lineHeight: 18 },
});
