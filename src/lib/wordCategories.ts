// Parts of speech for every word sign, so teachers can build modules by
// category ("Verbs", "Question words") and students can filter their words
// the same way. The categories are the traditional parts of speech taught in
// school (noun, pronoun, verb, adjective, adverb, preposition, conjunction,
// interjection), with interjections and set phrases shown as "Greetings &
// phrases", question words split out of pronouns/adverbs because they are
// taught as their own set. FSL's number words (one..ten) left the word model
// on 2026-11-02: they are taught and recognised in FSL Numbers. 23 ASL words
// that looked like another word and were right under half the time left the
// same day (REMOVED_WORDS in ml/scripts/consolidate_combined_words.py).
//
// A word that is more than one part of speech (ASL often uses one sign for
// "drink" and "a drink") is filed under the meaning a child meets first.
// Every word in a deployed model's label_classes.json must appear here exactly
// once; a missing one shows under "Other" (see getWordCategory). After
// deploying a model with new words, add them here.
import type { SignLanguage } from "./curriculum";

export type WordCategory =
  | "greeting"
  | "pronoun"
  | "question"
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "other";

/** Display order: the small "starter" sets first, then the big open classes. */
export const WORD_CATEGORIES: { key: WordCategory; label: string; singular: string }[] = [
  { key: "greeting", label: "Greetings & phrases", singular: "greeting or phrase" },
  { key: "pronoun", label: "Pronouns", singular: "pronoun" },
  { key: "question", label: "Question words", singular: "question word" },
  { key: "noun", label: "Nouns", singular: "noun" },
  { key: "verb", label: "Verbs", singular: "verb" },
  { key: "adjective", label: "Adjectives", singular: "adjective" },
  { key: "adverb", label: "Adverbs", singular: "adverb" },
  { key: "preposition", label: "Prepositions", singular: "preposition" },
  { key: "conjunction", label: "Conjunctions", singular: "conjunction" },
  { key: "other", label: "Other", singular: "word" },
];

const WORDS: Record<SignLanguage, Partial<Record<WordCategory, string[]>>> = {
  asl: {
    greeting: ["bye", "hello", "no", "please", "shhh", "thank you", "yes"],
    pronoun: ["he/she/it", "that", "we/us", "yourself"],
    question: ["what", "where", "who", "why"],
    noun: [
      // people and family
      "aunt", "boy", "brother", "champion", "child", "clown", "cousin", "cowboy", "dad", "daughter",
      "doctor", "family", "fireman", "girl", "grandma", "grandpa", "man", "mother", "person", "police",
      "secretary", "son", "uncle", "wife", "woman",
      // animals
      "alligator", "bird", "bug", "cat", "cow", "dog", "donkey", "duck", "elephant",
      "fish", "frog", "giraffe", "goose", "hen", "horse", "lion", "mouse", "owl", "pig",
      "puppy", "tiger", "wolf", "zebra",
      // body
      "arm", "ear", "eye", "face", "hair", "head", "nose", "owie", "tooth",
      // food and drink
      "apple", "candy", "carrot", "chocolate", "corn", "food", "french fries", "gum",
      "ice cream", "milk", "nuts", "pizza", "sandwich", "snack", "toast", "water",
      // clothes
      "hat", "jeans", "mitten", "pajamas", "shirt", "shoe", "underwear", "zipper",
      // home and things
      "TV", "backyard", "balloon", "bath", "bed", "bedroom", "blanket", "book", "chair", "closet",
      "computer", "doll", "drawer", "dryer", "garbage", "gift", "home", "lamp", "napkin",
      "pencil", "potty", "puzzle", "radio", "refrigerator", "room", "scissors", "shower",
      "stairs", "table", "toothbrush", "toy", "window",
      // places, vehicles and nature
      "airplane", "bar", "boat", "car", "cloud", "country", "farm", "flower", "grass", "helicopter",
      "moon", "pool", "rain", "snow", "store", "sun", "tree",
      // play
      "basketball", "bowling",
      // time
      "morning", "night", "thanksgiving", "thursday", "time", "year",
      // ideas
      "accident", "appointment", "environment", "example", "fault", "future", "government", "interest",
      "language", "letter", "perspective", "score", "speech", "story", "theory", "voice",
    ],
    verb: [
      "add", "argue", "balance", "blow", "call", "call on phone", "can", "catch", "change", "cheat",
      "check", "close", "convince", "cry", "cut", "dance", "delay", "discuss", "dive", "drink", "drop",
      "fall", "find", "finish", "give", "go", "graduate", "hate", "have", "have to", "help",
      "hide", "improve", "inform", "join", "jump", "laugh", "leave", "like", "listen", "look",
      "move", "nap", "open", "order", "play", "point", "read", "say", "see",
      "sleep", "smile", "study", "take", "talk", "taste", "tell", "think", "touch", "trade",
      "vacuum", "vomit", "wait", "walk", "want", "will", "work", "write",
    ],
    adjective: [
      // colours
      "black", "blue", "brown", "green", "orange", "pink", "red", "white", "yellow",
      // feelings
      "happy", "hungry", "mad", "sad", "sick", "silly", "sleepy", "thirsty", "upset",
      // describing things
      "awake", "bad", "better", "big", "clean", "cold", "cool", "cute", "dark", "deaf", "delicious",
      "different", "dirty", "dry", "empty", "far", "fast", "fat", "fine", "first", "full", "good",
      "high", "hot", "last", "loud", "mean", "noisy", "old", "pretty", "quiet", "ready", "same",
      "short", "sticky", "stuck", "sweet", "tall", "thin", "ugly", "wet", "yucky",
      // how many
      "all", "another", "any", "every", "many",
    ],
    adverb: ["alone", "down", "later", "not", "now", "outside", "soon", "there", "tomorrow", "up", "yesterday"],
    preposition: ["after", "before", "beside", "for", "into", "on"],
    conjunction: ["because", "if"],
  },
  fsl: {
    greeting: [
      "don’t know", "don’t understand", "good afternoon", "good evening", "good morning", "hello",
      "how are you", "im fine", "nice to meet you", "no", "no sugar", "see you tomorrow", "thank you",
      "yes", "youre welcome",
    ],
    noun: [
      // people and family
      "auntie", "boy", "cousin", "daughter", "father", "girl", "grandfather", "grandmother", "man",
      "mother", "parents", "son", "uncle", "weelchair person", "woman",
      // food and drink
      "beer", "bread", "chicken", "coffee", "crab", "egg", "fish", "juice", "longanisa", "meat", "milk",
      "rice", "shrimp", "spaghetti", "sugar", "tea", "wine",
      // days and months
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
      "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
      "november", "december",
    ],
    verb: ["know", "understand"],
    adjective: [
      // colours
      "black", "blue", "brown", "gray", "green", "light", "dark", "orange", "pink", "red", "violet",
      "white", "yellow",
      // describing people and things
      "blind", "correct", "cold", "deaf", "deaf blind", "fast", "hard of hearing", "hot", "married",
      "slow", "wrong",
    ],
    adverb: ["today", "tomorrow", "yesterday"],
  },
};

const LOOKUP: Record<SignLanguage, Map<string, WordCategory>> = {
  asl: new Map(),
  fsl: new Map(),
};
for (const language of Object.keys(WORDS) as SignLanguage[]) {
  for (const [category, words] of Object.entries(WORDS[language]) as [WordCategory, string[]][]) {
    for (const w of words) LOOKUP[language].set(w, category);
  }
}

export function getWordCategory(language: SignLanguage, sign: string): WordCategory {
  return LOOKUP[language].get(sign) ?? "other";
}

export function categoryLabel(category: WordCategory): string {
  return WORD_CATEGORIES.find((c) => c.key === category)!.label;
}

/**
 * The categories that actually occur in `signs`, in display order, with how
 * many signs each has. Empty categories are left out so a filter never offers
 * a choice with nothing behind it.
 */
export function categoriesIn(language: SignLanguage, signs: string[]): { key: WordCategory; label: string; count: number }[] {
  const counts = new Map<WordCategory, number>();
  for (const s of signs) {
    const c = getWordCategory(language, s);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return WORD_CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({ key: c.key, label: c.label, count: counts.get(c.key)! }));
}

/** `signs` narrowed to one category, keeping their order; null = all. */
export function filterByCategory(language: SignLanguage, signs: string[], category: WordCategory | null): string[] {
  return category ? signs.filter((s) => getWordCategory(language, s) === category) : signs;
}

/** Splits `signs` into runs of at most `size`, sized as evenly as possible (23 by 10 -> 8, 8, 7). */
export function evenChunks<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const n = Math.ceil(items.length / size);
  const base = Math.floor(items.length / n);
  const extra = items.length % n;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const len = base + (k < extra ? 1 : 0);
    out.push(items.slice(i, i + len));
    i += len;
  }
  return out;
}
