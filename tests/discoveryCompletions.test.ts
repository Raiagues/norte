import { describe, expect, it } from "vitest";
import { nameCompletions } from "../src/pages/BrainstormLab";
import { createCubesatReferenceModel } from "../examples/cubesat-reference.mjs";
import type { EngineeringSystemModel } from "../src/lib/engineeringSystem";

const model: EngineeringSystemModel = createCubesatReferenceModel();
const names = (text: string) => nameCompletions(text, model).map((item) => item.name);

describe("naming a hypothesis after the architecture", () => {
  it("offers the documented component behind an everyday word", () => {
    expect(names("mudar peso da camera para 1kg")).toContain("Camera CAM-3U");
  });

  it("ignores accents and case in what the writer typed", () => {
    expect(names("aumentar a ANTENA")).toContain("Deployable antenna");
  });

  it("stays quiet once the exact name is already written", () => {
    expect(names("mudar peso da Camera CAM-3U para 1kg")).not.toContain("Camera CAM-3U");
  });

  it("suggests nothing for words no element answers to", () => {
    expect(names("revisar o cronograma da equipe")).toEqual([]);
  });

  it("carries the numbers that tell two candidates apart", () => {
    const camera = nameCompletions("camera", model).find((item) => item.name === "Camera CAM-3U");
    expect(camera?.detail).toContain("350 g");
  });

  it("offers requirements by title as well as components", () => {
    expect(names("a autonomia minima muda?")).toContain("Minimum eclipse autonomy");
  });

  it("never proposes a container the user cannot change directly", () => {
    expect(names("mudar o payload")).not.toContain("Payload");
  });

  it("returns nothing without an architecture", () => {
    expect(nameCompletions("camera", undefined)).toEqual([]);
  });
});
