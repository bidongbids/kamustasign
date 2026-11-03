// Words mode: the ASL and FSL word models, sharing one camera.
//
// ASL (the 344-word model) and FSL (95 of FSL-105's words and phrases; its
// number words one..ten are in Numbers instead) are
// separate ensembles with separate vocabularies - see modelLoader.ts. FSL is
// the language KamustaSign's users actually sign; ASL stays for comparison
// and for its larger trained vocabulary.
//
// Second toggle: Auto (hands-free - each sign is detected from hand movement,
// see signSegmenter.ts) or Manual (Record/Stop). Remembered across sessions.
//
// Switching either toggle does NOT restart the camera: WordTranslatorScreen
// keeps its stream and Holistic graph and only swaps the ensemble or the
// capture logic behind them, the same way FingerspellingScreen swaps alphabets.

import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WordTranslatorScreen, { type CaptureMode } from "./WordTranslatorScreen";
import SegmentedToggle from "../components/SegmentedToggle";
import type { SignLanguage } from "../ml/modelLoader";

const LANGUAGES: { key: SignLanguage; label: string }[] = [
  { key: "asl", label: "ASL" },
  { key: "fsl", label: "FSL" },
];

const MODES: { key: CaptureMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "manual", label: "Manual" },
];

const MODE_STORAGE_KEY = "kamustasign:wordCaptureMode";

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
  const [mode, setMode] = useState<CaptureMode>("auto");

  useEffect(() => {
    AsyncStorage.getItem(MODE_STORAGE_KEY)
      .then((saved) => {
        if (saved === "auto" || saved === "manual") setMode(saved);
      })
      .catch(() => {});
  }, []);

  function changeMode(next: CaptureMode) {
    setMode(next);
    AsyncStorage.setItem(MODE_STORAGE_KEY, next).catch(() => {});
  }

  return (
    <View style={styles.root}>
      <View style={styles.toggles}>
        <SegmentedToggle options={LANGUAGES} value={language} onChange={setLanguage} />
        <SegmentedToggle options={MODES} value={mode} onChange={changeMode} />
      </View>

      <View style={styles.body}>
        <WordTranslatorScreen
          targetLanguage={targetLanguage}
          getCameraStream={getCameraStream}
          createHolisticLandmarker={createHolisticLandmarker}
          releaseLandmarker={releaseLandmarker}
          language={language}
          mode={mode}
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
  toggles: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    columnGap: 12,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
