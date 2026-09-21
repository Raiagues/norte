/** Disposable demonstration sandboxes for the login page.
 *
 * Each visit to the demo entry creates its own account, team, teammates and
 * projects so visitors never share or damage each other's view. Every record
 * carries `demoSandboxId`; the API scopes visibility by it and the sandbox is
 * removed after DEMO_TTL_MS or when the cap is exceeded. Nothing here reaches
 * real accounts, and demo accounts cannot log in with a password.
 */
import { randomBytes } from "node:crypto";
import { createValidationProject } from "./data-store.mjs";
import { organizationError } from "../shared/project-organization.mjs";
import { buildMission, DEMO_MISSIONS } from "./demo-mission.mjs";

/** Mirrors DEFAULT_LAB_SETTINGS in src/lib/brainstormLab.ts; the client fills any gap. */
const DEFAULT_LAB_SETTINGS = { autoOrganize: true, semanticProximity: true, separateAlternatives: true, placeQuestions: true, highlightTensions: true, provisionalGroups: true, suggestRelations: true, stabilizeMature: true, rewriteIdeas: true, flagIncomplete: true, flagDuplicates: true, missionStructure: false, semanticZoom: true };

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_DEMO_SANDBOXES = 20;
/** Reserved TLD: these addresses can never receive mail. */
export const DEMO_EMAIL_DOMAIN = "demo.norte.invalid";

export function demoAccountEnabled(env = process.env, production = env.NODE_ENV === "production") {
  if (env.NORTE_DEMO_ACCOUNT !== undefined && env.NORTE_DEMO_ACCOUNT !== "") return env.NORTE_DEMO_ACCOUNT === "1";
  return !production;
}

/** Records of one sandbox are only visible inside that sandbox; real users never see them. */
export function sameDemoScope(user, record) {
  return (user?.demoSandboxId || null) === (record?.demoSandboxId || null);
}

function sandboxIdOf(record) {
  return record?.demoSandboxId || record?.document?.demoSandboxId || null;
}

/** Remove expired sandboxes plus the oldest ones above the cap. */
export function pruneDemoSandboxes(data, now = Date.now(), { keep = MAX_DEMO_SANDBOXES } = {}) {
  const sandboxes = new Map();
  for (const user of data.users) {
    if (user.demoSandboxId && user.isDemoAccount && user.demoSandboxOwner) sandboxes.set(user.demoSandboxId, Date.parse(user.createdAt) || 0);
  }
  const ordered = [...sandboxes.entries()].sort((left, right) => right[1] - left[1]);
  const expired = new Set(ordered.filter(([, createdAt], index) => index >= keep || now - createdAt > DEMO_TTL_MS).map(([id]) => id));
  // Orphaned records whose owner vanished are removed with the same sweep.
  for (const record of [...data.users, ...data.members, ...data.teams, ...data.artifacts, ...Object.values(data.workspace.projects || {})]) {
    const id = sandboxIdOf(record);
    if (id && !sandboxes.has(id)) expired.add(id);
  }
  if (expired.size === 0) return [];
  const gone = (record) => expired.has(sandboxIdOf(record));
  const removedUserIds = new Set(data.users.filter(gone).map((user) => user.id));
  const removedTeamIds = new Set(data.teams.filter(gone).map((team) => team.id));
  const removedProjectIds = new Set(Object.entries(data.workspace.projects || {}).filter(([, record]) => gone(record)).map(([id]) => id));
  data.users = data.users.filter((item) => !gone(item));
  data.members = data.members.filter((item) => !gone(item));
  data.teams = data.teams.filter((item) => !gone(item));
  data.artifacts = data.artifacts.filter((item) => !gone(item));
  data.sessions = (data.sessions || []).filter((session) => !removedUserIds.has(session.userId));
  data.invitations = (data.invitations || []).filter((invite) => !removedTeamIds.has(invite.teamId) && !removedUserIds.has(invite.userId));
  data.activity = (data.activity || []).filter((row) => !removedUserIds.has(row.userId) && !removedProjectIds.has(row.projectId));
  for (const teamId of removedTeamIds) delete data.teamStats?.[teamId];
  for (const projectId of removedProjectIds) { delete data.workspace.projects[projectId]; delete data.workspace.labs?.[projectId]; }
  return [...expired];
}

const TEAMMATES = [
  ["luna", "Luna Ferreira", "Pesquisa"], ["caio", "Caio Andrade", "Aviônica"], ["iris", "Íris Nakamura", "Estruturas"],
  ["noa", "Noa Barbosa", "Propulsão"], ["davi", "Davi Moreira", "Software"], ["bia", "Bia Santana", "Validação"]
];

/** Build a complete sandbox inside `data` and return its visitor account. */
export function createDemoSandbox(data, now = new Date().toISOString()) {
  const sandboxId = `demo-${randomBytes(5).toString("hex")}`;
  const marker = { demoSandboxId: sandboxId };
  const suffix = sandboxId.slice(5);
  // argon2.verify rejects this value, so the password login can never open a demo account.
  const passwordHash = "demo-account-without-password";
  const account = (key, name, missionRole, area, extra = {}) => {
    const memberId = `${sandboxId}-${key}`;
    const user = {
      id: `${memberId}-user`, memberId, name, nickname: `${key}_${suffix.slice(0, 4)}`, email: `${key}.${suffix}@${DEMO_EMAIL_DOMAIN}`,
      passwordHash, emailVerifiedAt: now, accessRole: "member", institution: "Universidade Exemplo", course: "Engenharia Aeroespacial", academicStage: "6º período",
      availabilityHours: 8, avatarUrl: "", primaryArea: area, active: true, isDemoAccount: true, isTestAccount: true, createdAt: now, updatedAt: now, lastLoginAt: now, ...marker, ...extra
    };
    const member = {
      id: memberId, accountId: user.id, displayName: name, email: user.email, missionRole, primaryArea: area, secondaryAreas: [],
      institution: user.institution, course: user.course, academicStage: user.academicStage, skills: [], availabilityHours: 8, notes: "",
      avatarUrl: "", accountStatus: "active", createdAt: now, updatedAt: now, ...marker
    };
    data.users.push(user);
    data.members.push(member);
    return { user, member };
  };

  const owner = account("visitante", "Visitante Norte", "captain", "systems", { demoSandboxOwner: true });
  const teammates = TEAMMATES.map(([key, name, area]) => account(key, name, "member", area).member);
  const team = {
    id: `${sandboxId}-team`, name: "Equipe Horizonte", description: "",
    captainMemberId: owner.member.id, adminMemberIds: [], memberIds: [owner.member.id, ...teammates.map((member) => member.id)],
    artifactIds: [], joinRequests: [], createdBy: owner.user.id, createdAt: now, updatedAt: now, testFixture: true, ...marker
  };
  data.teams.push(team);

  const roles = [{ id: "captain", name: "Responsável pelo projeto" }, { id: "manager", name: "Gerente de setor" }, { id: "member", name: "Membro" }, { id: "advisor", name: "Orientador" }];
  const storeProject = (project) => {
    const error = organizationError(project);
    if (error) throw new Error(`Demo sandbox project is invalid: ${error}`);
    data.workspace.projects[project.id] = { document: project, revision: 1, createdBy: owner.user.id, createdAt: now, updatedAt: now, updatedBy: owner.user.id, ...marker };
  };
  const attachDocument = (project, folderId, label, fileName, text, tags, id, description) => {
    const bytes = Buffer.from(text);
    data.artifacts.push({
      id, kind: "document", label, url: `data:text/markdown;base64,${bytes.toString("base64")}`, documentText: text, fileName, mimeType: "text/markdown", size: bytes.length,
      folderId, scope: "project", ownerId: project.id, official: false, createdBy: owner.user.id, description, tags, connectedAt: now, updatedAt: now, ...marker
    });
    project.context.projectArtifactIds.push(id);
  };

  // Every project arrives with its design documents, the engineering system
  // derived from them and hypotheses already interpreted, so System and
  // Discovery show a complete mission without an extraction or AI request.
  for (const [index, definition] of DEMO_MISSIONS.entries()) {
    const project = { ...createValidationProject(now), id: `${sandboxId}-${definition.id}`, name: definition.name, projectType: definition.projectType, creatorId: owner.user.id, organizationRevision: 0, testFixture: true, ...marker };
    const lead = definition.lead < 0 ? owner.member.id : teammates[definition.lead].id;
    const sectors = definition.sectors.map((sectorName, position) => ({ id: `${project.id}-sector-${position}`, name: sectorName }));
    project.context = {
      ...project.context, configured: true, teamId: team.id, teamName: team.name, referenceProgram: null, sectors, roles,
      folders: sectors.map((sector) => ({ id: `${sector.id}-docs`, name: "Documentação", parentId: sector.id })),
      assignments: [
        { memberId: lead, roleId: "captain", sectorId: "" },
        ...teammates.filter((member) => member.id !== lead).map((member, position) => ({
          memberId: member.id, roleId: position < sectors.length ? "manager" : "member", sectorId: sectors[(position + index) % sectors.length].id,
          ...(position === 3 && sectors.length > 2 ? { sectorRoles: [{ sectorId: sectors[1].id, role: "member" }, { sectorId: sectors[2].id, role: "viewer" }] } : {})
        }))
      ]
    };
    if (lead !== owner.member.id) project.context.assignments.push({ memberId: owner.member.id, roleId: "manager", sectorId: sectors[0].id });
    project.setup.statement = definition.statement;
    const artifactIdFor = (documentId) => `${project.id}-${documentId}`;
    const mission = buildMission(definition, artifactIdFor, now);
    for (const document of mission.documents) attachDocument(project, `${sectors[document.sector].id}-docs`, document.label, document.fileName, document.text, ["projeto", "demonstração"], artifactIdFor(document.id), document.description);
    mission.model.generatedFromRevision = project.memoryRevision;
    project.engineeringSystem = mission.model;
    project.systemGeneratedFromRevision = mission.model.generatedFromRevision;
    project.phaseProgress = { highestUnlockedStep: 1 };
    project.navigation = { lastRoute: "brainstorm", lastConceptionWorkspace: "system" };
    storeProject(project);
    data.workspace.labs ??= {};
    data.workspace.labs[project.id] = {
      document: { schemaVersion: 1, ...mission.board, dismissedSuggestionIds: [], dismissedInsightIds: [], teamMemory: [], insights: [], gaps: [], settings: { ...DEFAULT_LAB_SETTINGS }, memoryRevision: project.memoryRevision, phaseProgress: project.phaseProgress },
      revision: 1, updatedAt: now, updatedBy: owner.user.id, ...marker
    };
  }

  return owner.user;
}
