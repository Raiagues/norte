import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildApp } from "./app.mjs";
import { createInitialData, VALIDATION_PROJECT_ID } from "./data-store.mjs";
import { validateEngineeringSystem } from "../shared/engineering-schema.mjs";
import { analyzeImpact } from "../shared/impact-engine.mjs";
import { buildMission, DEMO_MISSIONS } from "./demo-mission.mjs";
import { createDemoSandbox, DEMO_TTL_MS, demoAccountEnabled, MAX_DEMO_SANDBOXES, pruneDemoSandboxes } from "./demo-account.mjs";

function cookieFrom(response) {
  return response.headers["set-cookie"].split(";")[0];
}

async function appWithStore(t, options = {}) {
  const storeFile = join(tmpdir(), `norte-demo-${randomUUID()}.json`);
  const app = await buildApp({ storeFile, logger: false, ...options });
  t.after(async () => {
    await app.close();
    await rm(storeFile, { force: true });
  });
  return app;
}

test("demo availability follows NORTE_DEMO_ACCOUNT and defaults to development only", () => {
  assert.equal(demoAccountEnabled({}, false), true);
  assert.equal(demoAccountEnabled({}, true), false);
  assert.equal(demoAccountEnabled({ NORTE_DEMO_ACCOUNT: "1" }, true), true);
  assert.equal(demoAccountEnabled({ NORTE_DEMO_ACCOUNT: "0" }, false), false);
});

test("a sandbox holds a complete team and four missions with architecture and hypotheses", () => {
  const data = createInitialData();
  const owner = createDemoSandbox(data);
  assert.equal(owner.isDemoAccount, true);
  assert.ok(owner.email.endsWith("@demo.norte.invalid"));
  const team = data.teams.find((item) => item.demoSandboxId === owner.demoSandboxId);
  assert.equal(team.memberIds.length, 7);
  assert.equal(team.captainMemberId, owner.memberId);
  const projects = Object.values(data.workspace.projects).filter((record) => record.demoSandboxId === owner.demoSandboxId);
  assert.equal(projects.length, 4);
  for (const record of projects) {
    assert.ok(validateEngineeringSystem(record.document.engineeringSystem), record.document.name);
    for (const evidence of record.document.engineeringSystem.evidence) {
      assert.ok(data.artifacts.some((artifact) => artifact.id === evidence.artifactId), `evidence ${evidence.id} points to a stored artifact`);
    }
  }
  assert.equal(projects.filter((record) => record.document.engineeringSystem).length, 4, "every project ships its architecture");
  for (const record of projects) {
    const lab = data.workspace.labs[record.document.id];
    assert.equal(lab.demoSandboxId, owner.demoSandboxId);
    assert.equal(lab.document.nodes.filter((node) => node.interpretedChange).length, 3, record.document.name);
  }
  // Two sandboxes never collide on ids.
  const second = createDemoSandbox(data);
  assert.notEqual(second.demoSandboxId, owner.demoSandboxId);
  assert.equal(new Set(data.artifacts.map((artifact) => artifact.id)).size, data.artifacts.length);
});

test("expired and surplus sandboxes are removed with every dependent record", () => {
  const data = createInitialData();
  const old = createDemoSandbox(data, new Date(Date.now() - DEMO_TTL_MS - 1000).toISOString());
  data.sessions.push({ id: "s", userId: old.id, tokenHash: "x", csrfToken: "y", lastSeenAt: "", expiresAt: Date.now() + 1e6 });
  data.activity.push({ userId: old.id, projectId: `${old.demoSandboxId}-horizonte`, date: "2026-09-21", accesses: 1 });
  const fresh = createDemoSandbox(data);
  assert.deepEqual(pruneDemoSandboxes(data), [old.demoSandboxId]);
  assert.ok(!data.users.some((user) => user.demoSandboxId === old.demoSandboxId));
  assert.ok(!data.members.some((member) => member.demoSandboxId === old.demoSandboxId));
  assert.ok(!data.artifacts.some((artifact) => artifact.demoSandboxId === old.demoSandboxId));
  assert.equal(data.sessions.length, 0);
  assert.equal(data.activity.length, 0);
  assert.ok(!data.workspace.labs[`${old.demoSandboxId}-horizonte`]);
  assert.ok(data.workspace.labs[`${fresh.demoSandboxId}-horizonte`]);
  assert.ok(data.users.some((user) => user.id === fresh.id));
  assert.ok(data.workspace.projects[VALIDATION_PROJECT_ID], "the real validation project survives");

  for (let index = 0; index < MAX_DEMO_SANDBOXES + 3; index += 1) createDemoSandbox(data, new Date(Date.now() - index * 1000).toISOString());
  pruneDemoSandboxes(data);
  assert.equal(data.users.filter((user) => user.demoSandboxOwner).length, MAX_DEMO_SANDBOXES);
});

test("every demo mission validates and each hypothesis reaches the subsystems its story describes", () => {
  const status = (analysis, id) => analysis.impacts.find((impact) => impact.entityId === id)?.status;
  const missions = Object.fromEntries(DEMO_MISSIONS.map((definition) => {
    const { model, board } = buildMission(definition);
    assert.ok(validateEngineeringSystem(model), definition.name);
    assert.equal(board.nodes.filter((node) => node.interpretedChange).length, 3, definition.name);
    return [definition.id, { model, analyses: board.nodes.filter((node) => node.interpretedChange).map((node) => analyzeImpact(model, node.interpretedChange, "pt")) }];
  }));

  // Heavier, hungrier imager: mass and power limits break, and the change reaches
  // structure, attitude, orbit, thermal and the data link for review.
  const [swap, duty, deployable] = missions.horizonte.analyses;
  assert.equal(status(swap, "MI-001"), "critical");
  assert.equal(status(swap, "MI-002"), "critical");
  assert.equal(status(swap, "rail-5v"), "critical");
  for (const id of ["solar", "battery", "center-of-mass", "pointing", "orbit", "frame", "data-volume"]) assert.equal(status(swap, id), "review", id);
  assert.match(swap.impacts.find((impact) => impact.entityId === "battery").shortExplanation, /Saldo negativo \(-0\.228 W\)/u);
  assert.equal(status(duty, "MI-002"), "critical");
  assert.equal(status(duty, "MI-001"), "valid");
  assert.equal(deployable.metrics.critical, 0);

  // Rocket: the bigger motor breaks the rail limit and reopens apogee, stability
  // and descent; the camera computer drains the avionics battery; the bigger battery is fine.
  const [motor, camera, battery] = missions.aurora.analyses;
  assert.equal(status(motor, "MI-001"), "critical");
  for (const id of ["apogee", "stability", "descent"]) assert.equal(status(motor, id), "review", id);
  assert.equal(status(camera, "MI-002"), "critical");
  assert.equal(battery.metrics.critical, 0);

  // Balloon: the ozone module breaks payload mass and autonomy; the small battery only autonomy.
  const [ozone, smallBattery, doubleBattery] = missions.atmosfera.analyses;
  assert.equal(status(ozone, "MI-001"), "critical");
  assert.equal(status(ozone, "MI-002"), "critical");
  assert.equal(status(smallBattery, "MI-002"), "critical");
  assert.equal(status(smallBattery, "MI-001"), "valid");
  assert.equal(doubleBattery.metrics.critical, 0);

  // Ground station: the mini-PC drains the battery; the amplifier and the big antenna break the carry limit.
  const [minipc, amplifier, antenna] = missions.estacao.analyses;
  assert.equal(status(minipc, "PR-002"), "critical");
  assert.equal(status(minipc, "PR-001"), "valid");
  assert.equal(status(amplifier, "PR-001"), "critical");
  assert.equal(status(antenna, "PR-001"), "critical");
  assert.equal(status(antenna, "link-margin"), "review");
});

test("the demo entry opens an isolated session that cannot reach real teams or send mail", async (t) => {
  const app = await appWithStore(t, { demoAccount: true });
  const owner = await app.inject({ method: "POST", url: "/api/auth/register", payload: { name: "Marina Costa", email: "marina@example.edu.br", password: "uma frase longa para a missao" } });
  assert.equal(owner.statusCode, 201);
  const ownerCookie = cookieFrom(owner);

  const session = await app.inject({ method: "GET", url: "/api/auth/session" });
  assert.equal(session.json().demoAvailable, true);

  const demo = await app.inject({ method: "POST", url: "/api/auth/demo" });
  assert.equal(demo.statusCode, 201);
  assert.equal(demo.json().user.demoAccount, true);
  const cookie = cookieFrom(demo);
  const csrf = demo.json().csrfToken;

  const teams = (await app.inject({ method: "GET", url: "/api/teams", headers: { cookie } })).json().teams;
  assert.equal(teams.length, 1);
  assert.equal(teams[0].membership, "member");
  assert.equal(teams[0].canManage, true);
  const projects = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie } })).json().projects;
  assert.equal(projects.length, 4);
  const artifacts = (await app.inject({ method: "GET", url: "/api/artifacts", headers: { cookie } })).json().artifacts;
  assert.equal(artifacts.length, 8);
  const lab = await app.inject({ method: "GET", url: `/api/workspace/labs/${projects.find((project) => project.name.includes("Horizonte-1")).id}`, headers: { cookie } });
  assert.equal(lab.statusCode, 200);
  assert.equal(lab.json().board.nodes.length, 4);
  assert.ok(artifacts.every((artifact) => artifact.id.startsWith(demo.json().user.id.split("-visitante")[0])));

  // The real owner sees none of it, and the visitor sees none of the owner's data.
  const ownerTeams = (await app.inject({ method: "GET", url: "/api/teams", headers: { cookie: ownerCookie } })).json().teams;
  assert.ok(ownerTeams.every((team) => !team.name.includes("Horizonte")));
  const ownerProjects = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie: ownerCookie } })).json().projects;
  assert.ok(ownerProjects.every((project) => !project.id.startsWith("demo-")));
  const foreign = await app.inject({ method: "GET", url: `/api/teams/${ownerTeams[0].id}/projects`, headers: { cookie } });
  assert.equal(foreign.statusCode, 404);

  const invitation = await app.inject({ method: "POST", url: `/api/teams/${teams[0].id}/invitations`, headers: { cookie, "x-csrf-token": csrf }, payload: { email: "someone@example.edu.br" } });
  assert.equal(invitation.statusCode, 403);
  assert.equal(invitation.json().error, "DEMO_RESTRICTED");
  const verification = await app.inject({ method: "POST", url: "/api/auth/email-verification", headers: { cookie, "x-csrf-token": csrf } });
  assert.equal(verification.statusCode, 403);

  // No password ever opens a demo account.
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: demo.json().user.email, password: "demo-account-without-password" } });
  assert.equal(login.statusCode, 401);
});

test("the demo entry is hidden and refused when disabled", async (t) => {
  const app = await appWithStore(t, { demoAccount: false });
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session" })).json().demoAvailable, false);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/demo" })).statusCode, 404);
});
