// src/ml/modelLoader.ts
// Loads the converted TensorFlow.js sign-landmark classifier, bundled
// directly into the app (no network request needed at runtime).

import * as tf from "@tensorflow/tfjs";
import { bundleResourceIO } from "@tensorflow/tfjs-react-native";

const modelJson = require("../../assets/model/model.json");
const modelWeights = require("../../assets/model/group1-shard1of1.bin");
const labelClasses: string[] = require("../../assets/model/label_classes.json");

let cachedModel: tf.GraphModel | null = null;

export async function loadModel(): Promise<tf.GraphModel> {
  if (cachedModel) return cachedModel;
  await tf.ready();
  cachedModel = await tf.loadGraphModel(bundleResourceIO(modelJson, modelWeights));
  return cachedModel;
}

export function getLabelForIndex(index: number): string {
  return labelClasses[index] ?? "?";
}

export function getLabelCount(): number {
  return labelClasses.length;
}