// matchTrainingAspect: a tall phone frame is stretched back to the 4:3 shape
// the word models learned from; a 4:3 webcam frame is left alone.
import { FEATURES_PER_FRAME, matchTrainingAspect, NUM_HAND, NUM_POSE } from "../ml/wordLandmarks";

function frame(): Float32Array {
  const f = new Float32Array(FEATURES_PER_FRAME);
  for (let i = 0; i < NUM_POSE; i++) f.set([0.5, 0.4, -0.2, 0.9], i * 4);
  // left hand present, right hand missing (zeros)
  for (let i = 0; i < NUM_HAND; i++) f.set([0.3, 0.6, -0.05], NUM_POSE * 4 + i * 3);
  return f;
}

test("a 4:3 webcam frame is unchanged", () => {
  const frames = [frame()];
  expect(matchTrainingAspect(frames, 4 / 3)).toBe(frames);
});

test("an upright phone frame (3:4) has y stretched by 16/9, and nothing else changes", () => {
  const before = frame();
  const [after] = matchTrainingAspect([before], 3 / 4);
  const f = 16 / 9;
  for (let i = 0; i < NUM_POSE; i++) {
    expect(after[i * 4]).toBeCloseTo(0.5);
    expect(after[i * 4 + 1]).toBeCloseTo(0.4 * f);
    expect(after[i * 4 + 2]).toBeCloseTo(-0.2);
    expect(after[i * 4 + 3]).toBeCloseTo(0.9);
  }
  const left = NUM_POSE * 4;
  expect(after[left]).toBeCloseTo(0.3);
  expect(after[left + 1]).toBeCloseTo(0.6 * f);
  expect(after[left + 2]).toBeCloseTo(-0.05);
  // the missing right hand stays all zeros
  expect(Array.from(after.subarray(left + NUM_HAND * 3)).every((v) => v === 0)).toBe(true);
  // the input frame isn't modified
  expect(before[1]).toBeCloseTo(0.4);
});

test("an unknown frame shape leaves the frames alone", () => {
  const frames = [frame()];
  expect(matchTrainingAspect(frames, 0)).toBe(frames);
  expect(matchTrainingAspect(frames, NaN)).toBe(frames);
});
