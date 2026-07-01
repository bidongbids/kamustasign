import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as tf from "@tensorflow/tfjs";
import { loadModel, getLabelForIndex, getLabelCount } from "../ml/modelLoader";
import { colors, fonts, spacing, radii } from "../theme/theme";

export default function TestModelScreen() {
  const [status, setStatus] = useState("Not loaded yet");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);

  async function runTest() {
    setLoading(true);
    setStatus("Loading model...");
    setPrediction(null);
    try {
      const model = await loadModel();
      setStatus("Model loaded. Classes available: " + getLabelCount());

      const dummyInput = tf.tensor2d(
        [Array.from({ length: 63 }, () => Math.random())],
        [1, 63]
      );

      const outputTensor = model.predict(dummyInput);
      const outputData = await outputTensor.data();

      const maxIndex = outputData.indexOf(Math.max(...Array.from(outputData)));
      const label = getLabelForIndex(maxIndex);
      const confidence = (outputData[maxIndex] * 100).toFixed(1);

      setPrediction(label + " (" + confidence + "% confidence)");
      setStatus("Prediction complete.");

      dummyInput.dispose();
      outputTensor.dispose();
    } catch (err) {
      setStatus("ERROR: " + (err && err.message ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Model Load Test</Text>
      <Text style={styles.status}>{status}</Text>

      {loading && <ActivityIndicator size="large" color={colors.primaryTeal} style={{ marginVertical: spacing.md }} />}

      {prediction && (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Predicted class on random dummy data:</Text>
          <Text style={styles.resultValue}>{prediction}</Text>
          <Text style={styles.resultNote}>
            This is meaningless as a real sign prediction since the input is
            random noise, not real landmarks. The point is just confirming
            the model loads and produces a valid 28-class output.
          </Text>
        </View>
      )}

      <Pressable style={styles.button} onPress={runTest} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Running..." : "Run Test Prediction"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.primaryTeal,
    marginBottom: spacing.md,
  },
  status: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  resultBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    width: "100%",
    maxWidth: 340,
  },
  resultLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  resultValue: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primaryTeal,
    marginVertical: spacing.xs,
  },
  resultNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primaryTeal,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
  },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.textOnPrimary,
  },
});
