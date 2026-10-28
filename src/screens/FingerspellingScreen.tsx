// Fingerspelling mode: the letter and number alphabets, sharing one camera.
//
// Letters and numbers are separate models rather than one 38-class model,
// because several ASL digits are the same handshape as a letter - O/0, F/9,
// V/2, W/6 are identical, not merely similar. A single model would be asked to
// separate classes that are indistinguishable in the data. This toggle supplies
// the context a human reader gets from knowing whether a word or a number is
// being spelled, which is what makes the distinction recoverable at all.
// See modelLoader.ts for the loading side.
//
// ASL and FSL each have their own letters and numbers models; the language
// toggle picks the pair, the same way WordsScreen picks the word model.
//
// Switching here does NOT restart the camera: LiveTranslatorScreen keeps its
// stream and MediaPipe graph and only swaps the classifier behind them.

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import LiveTranslatorScreen from "./LiveTranslatorScreen";
import SegmentedToggle from "../components/SegmentedToggle";
import type { Alphabet, SignLanguage } from "../ml/modelLoader";

const LANGUAGES: { key: SignLanguage; label: string }[] = [
  { key: "asl", label: "ASL" },
  { key: "fsl", label: "FSL" },
];

const ALPHABETS: { key: Alphabet; label: string }[] = [
  { key: "letters", label: "Letters" },
  { key: "numbers", label: "Numbers" },
];

type Props = {
  targetLanguage: string;
  getCameraStream: () => Promise<MediaStream>;
  createHandLandmarker: () => Promise<any>;
  releaseLandmarker: (instance: any) => void;
};

export default function FingerspellingScreen({
  targetLanguage,
  getCameraStream,
  createHandLandmarker,
  releaseLandmarker,
}: Props) {
  const [alphabet, setAlphabet] = useState<Alphabet>("letters");
  const [language, setLanguage] = useState<SignLanguage>("asl");

  return (
    <View style={styles.root}>
      <View style={styles.toggles}>
        <SegmentedToggle options={LANGUAGES} value={language} onChange={setLanguage} />
        <SegmentedToggle options={ALPHABETS} value={alphabet} onChange={setAlphabet} />
      </View>

      <View style={styles.body}>
        <LiveTranslatorScreen
          targetLanguage={targetLanguage}
          getCameraStream={getCameraStream}
          createHandLandmarker={createHandLandmarker}
          releaseLandmarker={releaseLandmarker}
          alphabet={alphabet}
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
  // As WordsScreen's language + mode toggles.
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
