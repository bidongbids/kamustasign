// Words mode: the ASL and FSL word models, sharing one camera.
//
// ASL (the 133-word model) and FSL (FSL-105's 105 words and phrases) are
// separate ensembles with separate vocabularies - see modelLoader.ts. FSL is
// the language KamustaSign's users actually sign; ASL stays for comparison
// and for its larger trained vocabulary.
//
// Switching here does NOT restart the camera: WordTranslatorScreen keeps its
// stream and Holistic graph and only swaps the ensemble behind them, the same
// way FingerspellingScreen swaps alphabets.

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import WordTranslatorScreen from "./WordTranslatorScreen";
import SegmentedToggle from "../components/SegmentedToggle";
import type { SignLanguage } from "../ml/modelLoader";

const LANGUAGES: { key: SignLanguage; label: string }[] = [
  { key: "asl", label: "ASL" },
  { key: "fsl", label: "FSL" },
];

type Props = {
  targetLanguage: string;
  getCameraStream: () => Promise<MediaStream>;
  createHolisticLandmarker: () => Promise<any>;
  releaseLandmarker: (instance: any) => void;
};

export default function WordsScreen({
  targetLanguage,
  getCameraStream,
  createHolisticLandmarker,
  releaseLandmarker,
}: Props) {
  const [language, setLanguage] = useState<SignLanguage>("asl");

  return (
    <View style={styles.root}>
      <SegmentedToggle options={LANGUAGES} value={language} onChange={setLanguage} />

      <View style={styles.body}>
        <WordTranslatorScreen
          targetLanguage={targetLanguage}
          getCameraStream={getCameraStream}
          createHolisticLandmarker={createHolisticLandmarker}
          releaseLandmarker={releaseLandmarker}
          language={language}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
