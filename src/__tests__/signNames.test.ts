// Needs public/fsl-model/label_classes.json (gitignored - see FSL_MODEL_GUIDE.md).
import { getGroup } from "../lib/curriculum";
import { FSL_TAGALOG_KEYS, signMatches, signName } from "../lib/signNames";

describe("sign names", () => {
  const fslWords = getGroup("fsl", "words").signs;

  it("gives every FSL word a Tagalog name, and no extras", () => {
    expect(fslWords.filter((w) => !FSL_TAGALOG_KEYS.includes(w))).toEqual([]);
    expect(FSL_TAGALOG_KEYS.filter((k) => !fslWords.includes(k))).toEqual([]);
  });

  it("never shows two FSL words under the same name", () => {
    const names = fslWords.map((w) => signName("fsl", w).toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("only renames FSL words", () => {
    expect(signName("fsl", "thank you")).toBe("salamat");
    expect(signName("asl", "thank you")).toBe("thank you");
    expect(signName("fsl", "A")).toBe("A");
    expect(signName("fsl", "7")).toBe("7");
  });

  it("searches by the Tagalog name or the English key", () => {
    expect(signMatches("fsl", "thank you", "sala")).toBe(true);
    expect(signMatches("fsl", "thank you", "thank")).toBe(true);
    expect(signMatches("fsl", "thank you", "kape")).toBe(false);
    expect(signMatches("fsl", "thank you", "  ")).toBe(true);
  });
});
