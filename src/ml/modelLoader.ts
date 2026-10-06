import { Platform } from "react-native";
import * as tf from "@tensorflow/tfjs";
import { bundleResourceIO } from "@tensorflow/tfjs-react-native";

// Fingerspelling has two alphabets, and they need SEPARATE models rather than
// one 38-class model. Several ASL digits are the same handshape as a letter -
// O/0, F/9, V/2, W/6 are identical, not merely similar. Training them as
// distinct classes asks the network to find a difference that is not in the
// data, which costs accuracy on those classes and on their neighbours. Keeping
// the alphabets apart means neither model ever sees its own homomorph, and the
// Letters/Numbers toggle in the UI supplies the disambiguating context that a
// human reader would get from knowing whether a word or a number is being spelled.

export type Alphabet = "letters" | "numbers";

type LoadedAlphabet = { model: any; classes: string[] };

const alphabetCache: Partial<Record<Alphabet, LoadedAlphabet>> = {};

const WEB_MODEL_DIR: Record<Alphabet, string> = {
  letters: "/model",
  numbers: "/number-model",
};

export async function loadAlphabet(alphabet: Alphabet = "letters"): Promise<LoadedAlphabet> {
  const cached = alphabetCache[alphabet];
  if (cached) return cached;
  await tf.ready();

  let loaded: LoadedAlphabet;

  if (Platform.OS === "web") {
    const dir = WEB_MODEL_DIR[alphabet];
    const model = await tf.loadGraphModel(`${dir}/model.json`);
    const res = await fetch(`${dir}/label_classes.json`);
    if (!res.ok) {
      throw new Error(
        `Could not load ${dir}/label_classes.json - is the ${alphabet} model ` +
          `deployed under public${dir}/?`
      );
    }
    loaded = { model, classes: await res.json() };
  } else {
    // require() paths must be static for the native bundler, so the numbers
    // model cannot be referenced until its assets actually exist. Add
    // assets/number-model/ and a matching branch here to enable it on native.
    if (alphabet !== "letters") {
      throw new Error(
        `The "${alphabet}" model is not bundled for native yet. Add its files under ` +
          `assets/number-model/ and mirror the letters require() calls in modelLoader.ts.`
      );
    }
    const modelJson = require("../../assets/model/model.json");
    const modelWeights = require("../../assets/model/group1-shard1of1.bin");
    const classes = require("../../assets/model/label_classes.json");
    loaded = {
      model: await tf.loadGraphModel(bundleResourceIO(modelJson, modelWeights)),
      classes,
    };
  }

  alphabetCache[alphabet] = loaded;
  return loaded;
}

// Kept for callers that only ever want letters (TestModelScreen,
// useSignRecognitionOverlay). Behaviour is unchanged from before the split.
export async function loadModel() {
  const { model } = await loadAlphabet("letters");
  return model;
}

export function getLabelForIndex(index: number) {
  return alphabetCache.letters?.classes?.[index] ?? "?";
}

export function getLabelCount() {
  return alphabetCache.letters?.classes?.length ?? 0;
}

// --- Word-level sequence model (ensemble) ---------------------------------
// Separate from the alphabet loader above: this loads several TF.js graph
// models trained on different random seeds (see ml/scripts/train_word_
// classifier.py) and their outputs are averaged at inference time, which
// measurably beat any single model on the held-out test set (15.36% vs
// 12.36% top-1 solo). Missing model slots are skipped rather than treated
// as an error, so this still works if only some seeds have been deployed.
//
// One ensemble per sign language: ASL (ml/scripts/train_word_classifier.py)
// and FSL (train_fsl_classifier.py, FSL-105 vocabulary). Same feature
// layout and architecture, different vocabularies, so each is cached under
// its own key and the Words screen can swap between them without touching
// the camera or the landmarker.

export type SignLanguage = "asl" | "fsl";

export type LoadedWordModels = { models: any[]; classes: string[] };

const WORD_MODEL_WEB_DIR: Record<SignLanguage, string> = {
  asl: "/word-model",
  fsl: "/fsl-model",
};

// Chrome opens at most 6 HTTP/1.1 connections per origin (the Metro dev
// server is HTTP/1.1), and tf.loadGraphModel()'s default weight loader fires
// a fetch for every shard at once, then awaits ALL of their response headers
// before reading ANY body (tfjs-core io/weights_loader.js). Each word model
// is 20 x 4MB shards: the first 6 responses arrive, their unread bodies pin
// all 6 sockets, the other 14 shards never get one, and the load deadlocks -
// taking every other same-origin request down with it, including
// MediaPipe's /mediapipe/*.task downloads. That is what left the Words
// camera black (setup() never got past building the landmarker) and then
// Letters too after switching back. This fetch reads each body to the end
// before handing it to TF.js, so a socket frees up as soon as its shard is
// in, and caps concurrent shard downloads so a couple of sockets always stay
// free for the rest of the page.
const MAX_CONCURRENT_WEIGHT_FETCHES = 4;
let activeWeightFetches = 0;
const waitingWeightFetches: Array<() => void> = [];

async function drainingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (activeWeightFetches < MAX_CONCURRENT_WEIGHT_FETCHES) {
    activeWeightFetches++;
  } else {
    // The releasing fetch hands its slot straight to us (see finally below).
    await new Promise<void>((resolve) => waitingWeightFetches.push(resolve));
  }
  try {
    const res = await fetch(input, init);
    const body = await res.arrayBuffer();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } finally {
    const next = waitingWeightFetches.shift();
    if (next) next();
    else activeWeightFetches--;
  }
}

const WORD_MODEL_SLOTS = ["model0", "model1", "model2", "model3"];

// The in-flight load is cached, not just its result: a second Words mount
// or an early Record->Stop must join the download already under way rather
// than start another full ensemble download (whose tensors would then be
// orphaned when it finished, since nothing disposes the models). A failed
// load is dropped so the next call can retry. Keyed per language, so
// switching ASL->FSL->ASL reuses the ASL ensemble already in memory.
const wordModelsPromises: Partial<Record<SignLanguage, Promise<LoadedWordModels>>> = {};

export function loadWordModels(language: SignLanguage = "asl"): Promise<LoadedWordModels> {
  let p = wordModelsPromises[language];
  if (!p) {
    p = fetchWordModels(language).catch((e) => {
      delete wordModelsPromises[language];
      throw e;
    });
    wordModelsPromises[language] = p;
  }
  return p;
}

async function fetchWordModels(language: SignLanguage): Promise<LoadedWordModels> {
  await tf.ready();

  if (Platform.OS !== "web") {
    throw new Error("Word model inference currently supports web only.");
  }

  const dir = WORD_MODEL_WEB_DIR[language];
  const res = await fetch(`${dir}/label_classes.json`);
  if (!res.ok) {
    throw new Error(
      `Could not load ${dir}/label_classes.json - did you copy the ` +
        `converted ${language.toUpperCase()} word model files into public${dir}/?`
    );
  }
  const classes: string[] = await res.json();

  const models = [];
  for (const slot of WORD_MODEL_SLOTS) {
    const path = `${dir}/${slot}/model.json`;
    try {
      const check = await fetch(path, { method: "HEAD" });
      if (!check.ok) continue;
      models.push(await tf.loadGraphModel(path, { fetchFunc: drainingFetch }));
    } catch (e) {
      // Model slot not deployed - skip, ensemble just uses whichever exist.
    }
  }

  if (models.length === 0) {
    throw new Error(
      `No word models found under ${dir}/. Deploy at least ` +
        `public${dir}/model0/ (see FSL_MODEL_GUIDE.md / the training scripts).`
    );
  }

  return { models, classes };
}
