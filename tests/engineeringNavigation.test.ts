import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/lib/auth";
import { MissionSidebar } from "../src/components/MissionSidebar";
import { HomePage } from "../src/pages/HomePage";
import { completeConception, createEmptyProject, normalizeProject, recordMemoryRevision, saveProject } from "../src/lib/projectStore";
import type { EngineeringSystemModel } from "../src/lib/engineeringSystem";
import { changeFromHypothesis, recognizeEngineeringHypothesis } from "../src/lib/discoveryEngineering";

vi.mock("../src/components/UserBadge", () => ({ UserBadge: () => null }));

const model: EngineeringSystemModel = { schemaVersion: 1, id: "test-system", name: "Validation", generatedAt: "2026-09-08T00:00:00Z", generatedFromRevision: 2, relations: [], requirements: [], evidence: [], artifactSources: [], entities: [
  { id: "payload", name: "Payload", kind: "component", description: "", source: "documented", confidence: 1, evidenceRefs: [], properties: [{ key: "mass", name: "Mass", value: 120, unit: "g", source: "documented", evidenceRefs: [] }] },
  { id: "radio", name: "Rádio", kind: "component", description: "", source: "documented", confidence: 1, evidenceRefs: [], properties: [{ key: "model", name: "Model", value: "RFM95", source: "documented", evidenceRefs: [] }] }
] };
const noop = () => undefined;
function sidebar(highestUnlockedStep: number, currentStep: number | null, projectTeamName = "Team one") {
  return renderToStaticMarkup(createElement(AuthProvider, { children: createElement(MissionSidebar, { language: "en", highestUnlockedStep, currentStep, expanded: true, connectedLabel: "Connected", homeLabel: "Home", teamLabel: "Teams", homeActive: false, teamActive: false, projects: [], activeProjectId: "p", projectTeamName, onToggle: noop, onHome: noop, onTeam: noop, onProjectSelect: noop, onStepSelect: noop }) }));
}

describe("project-owned conception progression", () => {
  it("starts locked, persists completion and never relocks when memory becomes active", () => {
    const fresh = createEmptyProject("en");
    expect(fresh.phaseProgress.highestUnlockedStep).toBe(0);
    const completed = completeConception(fresh, model);
    const revisited = saveProject({ ...completed, navigation: { ...completed.navigation, lastRoute: "setup" } });
    const reloaded = normalizeProject(JSON.parse(JSON.stringify(revisited)));
    expect(reloaded.phaseProgress.highestUnlockedStep).toBe(1);
    expect(reloaded.engineeringSystem).toEqual(model);
    expect(reloaded.navigation.lastConceptionWorkspace).toBe("system");
    expect(createEmptyProject().phaseProgress.highestUnlockedStep).toBe(0);
  });
  it("preserves historical progress and old boards without creating an engineering model", () => {
    const old = createEmptyProject();
    Reflect.deleteProperty(old, "phaseProgress");
    Reflect.deleteProperty(old, "memoryRevision");
    old.navigation.lastRoute = "brainstorm";
    const normalized = normalizeProject(old);
    expect(normalized.phaseProgress.highestUnlockedStep).toBe(1);
    expect(normalized.engineeringSystem).toBeUndefined();
    expect(normalized.board).toEqual(old.board);
  });
  it("changes memory revision for linked sources but not route or canvas positions", () => {
    const project = createEmptyProject();
    expect(recordMemoryRevision(project, { ...project, navigation: { lastRoute: "brainstorm" } }).memoryRevision).toBe(0);
    const changed = recordMemoryRevision(project, { ...project, context: { ...project.context, projectArtifactIds: ["datasheet"] } });
    expect(changed.memoryRevision).toBe(1);
    expect(recordMemoryRevision(changed, { ...changed, name: "Updated" }).memoryRevision).toBe(2);
  });
  it("renders one project selector, read-only owning team and route-independent conception access", () => {
    const locked = sidebar(0, 0);
    const unlocked = sidebar(1, 0);
    expect(locked).toMatch(/class="mission-phase locked"[^>]*disabled=""/u);
    expect(unlocked).toMatch(/class="mission-phase available"/u);
    expect((unlocked.match(/<select/g) ?? []).length).toBe(1);
    expect(unlocked).toContain("Team one");
    expect(sidebar(1, null, "Team two")).toContain("Team two");
    expect(sidebar(0, null)).toMatch(/class="mission-phase locked"/u);
  });
  it("keeps new project visibly disabled", () => {
    const html = renderToStaticMarkup(createElement(AuthProvider, { children: createElement(HomePage, { language: "en", t: (key) => key, onLanguageChange: noop }) }));
    expect(html).toMatch(/class="home-action-card accent-create"[^>]*disabled=""/u);
    expect(html).toContain("Coming soon");
  });
});

describe("quiet engineering hypothesis recognition", () => {
  it("resolves absolute TX duty and continuous transmission without a setup form", () => {
    const dutyModel: EngineeringSystemModel = { ...model, entities: [{ ...model.entities[1], name: "Transmitter Q7", properties: [{ key: "tx_duty_cycle", name: "TX duty cycle", value: 3.6, unit: "%", source: "documented", evidenceRefs: ["design-duty"] }] }] };
    const suggestion = recognizeEngineeringHypothesis("Q7 TX de 3,6% para 10%", dutyModel)!;
    expect(suggestion).toEqual({ targetEntityId: "radio", propertyKey: "tx_duty_cycle", value: 10, unit: "%" });
    const change = changeFromHypothesis(suggestion, dutyModel, "Q7 TX para 10%");
    expect(change?.oldValues[0].value).toBe(3.6);
    expect(change?.newValues[0]).toMatchObject({ value: 10, source: "user", evidenceRefs: [] });
    expect(recognizeEngineeringHypothesis("communications transmitter remains continuously active", dutyModel)?.value).toBe(100);
    expect(recognizeEngineeringHypothesis("transmissor continuamente ativo", dutyModel)?.value).toBe(100);
    expect(recognizeEngineeringHypothesis("transmitter not continuously active", dutyModel)).toBeUndefined();
    expect(recognizeEngineeringHypothesis("Increase Q7 TX by 10%", dutyModel)).toBeUndefined();
    const ambiguous = { ...dutyModel, entities: [...dutyModel.entities, { ...dutyModel.entities[0], id: "second-radio", name: "Second transmitter" }] };
    expect(recognizeEngineeringHypothesis("transmitter continuously active", ambiguous)).toBeUndefined();
  });
  it("recognizes the proposed final mass in Portuguese and English", () => {
    expect(recognizeEngineeringHypothesis("Payload de 120 g para 280 g", model)).toEqual({ targetEntityId: "payload", propertyKey: "mass", value: 280, unit: "g" });
    expect(recognizeEngineeringHypothesis("Increase Payload to 0.28 kg", model)?.value).toBe(.28);
  });
  it("recognizes a replacement but stays silent for discussion and ambiguous targets", () => {
    expect(recognizeEngineeringHypothesis("Talvez usar o rádio XR2", model)).toEqual({ targetEntityId: "radio", replacementName: "XR2" });
    expect(recognizeEngineeringHypothesis("Need to talk about radio", model)).toBeUndefined();
    expect(recognizeEngineeringHypothesis("Payload and radio 280 g", model)).toBeUndefined();
    expect(recognizeEngineeringHypothesis("Payload 280 g")).toBeUndefined();
    expect(recognizeEngineeringHypothesis("Payload 120 g", model)).toBeUndefined();
  });
});
