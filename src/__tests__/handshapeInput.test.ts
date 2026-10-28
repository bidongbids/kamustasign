import { frameAspect, handshapeInput } from "../ml/handshapeInput";

const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.1 + i * 0.01, y: 0.5, z: -0.02 }));

describe("handshapeInput", () => {
  it("passes raw landmarks through for the original letters model", () => {
    const flat = handshapeInput(hand, { format: "raw", aspect: 4 / 3, mirror: false });
    expect(flat).toHaveLength(63);
    expect(flat.slice(0, 3)).toEqual([0.1, 0.5, -0.02]);
  });

  it("scales x and z by the frame's aspect for the newer models, after mirroring", () => {
    const flat = handshapeInput(hand, { format: "aspect", aspect: 4 / 3, mirror: true });
    expect(flat[0]).toBeCloseTo((1 - 0.1) * (4 / 3), 10); // mirrored, then scaled
    expect(flat[1]).toBe(0.5); // y untouched
    expect(flat[2]).toBeCloseTo(-0.02 * (4 / 3), 10);
  });

  it("assumes 640x480 until the video has a size", () => {
    expect(frameAspect(null)).toBeCloseTo(4 / 3);
    expect(frameAspect({ videoWidth: 0, videoHeight: 0 })).toBeCloseTo(4 / 3);
    expect(frameAspect({ videoWidth: 1280, videoHeight: 720 })).toBeCloseTo(16 / 9);
  });
});
