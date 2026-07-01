import { Platform } from "react-native";
import * as tf from "@tensorflow/tfjs";
import { bundleResourceIO } from "@tensorflow/tfjs-react-native";

let cachedModel = null;
let labelClasses = null;

export async function loadModel() {
  if (cachedModel) return cachedModel;
  await tf.ready();

  if (Platform.OS === "web") {
    cachedModel = await tf.loadGraphModel("/model/model.json");
    const res = await fetch("/model/label_classes.json");
    labelClasses = await res.json();
  } else {
    const modelJson = require("../../assets/model/model.json");
    const modelWeights = require("../../assets/model/group1-shard1of1.bin");
    labelClasses = require("../../assets/model/label_classes.json");
    cachedModel = await tf.loadGraphModel(bundleResourceIO(modelJson, modelWeights));
  }

  return cachedModel;
}

export function getLabelForIndex(index) {
  return labelClasses ? (labelClasses[index] ?? "?") : "?";
}

export function getLabelCount() {
  return labelClasses ? labelClasses.length : 0;
}
