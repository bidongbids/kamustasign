// What the app calls each sign on screen. A sign's key is the model's class
// label (label_classes.json), which is also what lesson_progress, class plans,
// modules, reference media and the word lists store, so it never changes.
// FSL words are shown in Tagalog: the FSL-105 labels are English glosses.
// Translation and speech still start from the English key (the translator's
// source text), so only the display goes through here.
import type { SignLanguage } from "./curriculum";

const FSL_WORDS_TAGALOG: Record<string, string> = {
  // greetings and phrases
  hello: "kumusta",
  "how are you": "kumusta ka",
  "im fine": "mabuti naman ako",
  "good morning": "magandang umaga",
  "good afternoon": "magandang hapon",
  "good evening": "magandang gabi",
  "nice to meet you": "ikinagagalak kitang makilala",
  "thank you": "salamat",
  "youre welcome": "walang anuman",
  "see you tomorrow": "kita tayo bukas",
  yes: "oo",
  no: "hindi",
  correct: "tama",
  wrong: "mali",
  know: "alam",
  "don’t know": "hindi alam",
  understand: "naiintindihan",
  "don’t understand": "hindi naiintindihan",
  // people and family
  man: "lalaki",
  woman: "babae",
  boy: "batang lalaki",
  girl: "batang babae",
  father: "tatay",
  mother: "nanay",
  parents: "magulang",
  son: "anak na lalaki",
  daughter: "anak na babae",
  grandfather: "lolo",
  grandmother: "lola",
  uncle: "tito",
  auntie: "tita",
  cousin: "pinsan",
  married: "kasal",
  deaf: "bingi",
  blind: "bulag",
  "deaf blind": "bingi at bulag",
  "hard of hearing": "mahina ang pandinig",
  "weelchair person": "naka-wheelchair",
  // food and drink
  bread: "tinapay",
  chicken: "manok",
  egg: "itlog",
  fish: "isda",
  crab: "alimango",
  shrimp: "hipon",
  meat: "karne",
  rice: "kanin",
  longanisa: "longganisa",
  spaghetti: "ispageti",
  sugar: "asukal",
  "no sugar": "walang asukal",
  milk: "gatas",
  coffee: "kape",
  tea: "tsaa",
  juice: "juice",
  beer: "serbesa",
  wine: "alak",
  // colours (FSL-105 files orange, light and dark under colours)
  black: "itim",
  white: "puti",
  red: "pula",
  blue: "asul",
  green: "berde",
  yellow: "dilaw",
  orange: "kahel",
  pink: "rosas",
  violet: "lila",
  brown: "kayumanggi",
  gray: "abo",
  light: "mapusyaw",
  dark: "madilim",
  // describing
  hot: "mainit",
  cold: "malamig",
  fast: "mabilis",
  slow: "mabagal",
  // (one..ten left the word model on 2026-11-02; FSL Numbers shows them as 1-10)
  // days and time
  today: "ngayon",
  tomorrow: "bukas",
  yesterday: "kahapon",
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miyerkules",
  thursday: "Huwebes",
  friday: "Biyernes",
  saturday: "Sabado",
  sunday: "Linggo",
  january: "Enero",
  february: "Pebrero",
  march: "Marso",
  april: "Abril",
  may: "Mayo",
  june: "Hunyo",
  july: "Hulyo",
  august: "Agosto",
  september: "Setyembre",
  october: "Oktubre",
  november: "Nobyembre",
  december: "Disyembre",
};

/** The sign's name as the app shows it. Letters and numbers are their own glyphs. */
export function signName(language: SignLanguage, sign: string): string {
  return (language === "fsl" && FSL_WORDS_TAGALOG[sign]) || sign;
}

/** True when a search matches the shown name or the stored (English) key. */
export function signMatches(language: SignLanguage, sign: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || sign.toLowerCase().includes(q) || signName(language, sign).toLowerCase().includes(q);
}

/** Every FSL word key with a Tagalog name, for the coverage test. */
export const FSL_TAGALOG_KEYS = Object.keys(FSL_WORDS_TAGALOG);
