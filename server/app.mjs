import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import argon2 from "argon2";
import { JsonDataStore } from "./data-store.mjs";
import { PostgresDataStore } from "./postgres-store.mjs";
import { brainstormRequestSchema, createBrainstormAiService } from "./brainstorm-ai.mjs";
import { analysisRequestSchema, createSystemAiService, generationRequestSchema, projectArtifacts, validateEngineeringSystem } from "./system-ai.mjs";
import { artifactReadabilityRecord } from "./artifact-content.mjs";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 15;
const ACCESS_ROLES = ["owner_admin", "captain", "manager", "member", "advisor"];
const MEMBER_STATUSES = ["demo", "invited", "active"];
const ARTIFACT_KINDS = ["official", "document", "repository", "dataset", "link"];
const MAX_ARTIFACT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BODY_BYTES = 6 * 1024 * 1024;
const SAFE_ARTIFACT_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain"
]);
const COMMON_PASSWORDS = new Set([
  "123456789012345",
  "passwordpassword",
  "senha1234567890",
  "missiondev12345",
  "qwertyuiop12345"
]);

const string = (maxLength, minLength = 0) => ({ type: "string", minLength, maxLength });
const stringList = (maxItems = 12, maxLength = 80) => ({ type: "array", maxItems, items: string(maxLength, 1), uniqueItems: true });

const profileProperties = {
  displayName: string(100, 2),
  email: string(254, 3),
  missionRole: string(60),
  primaryArea: string(80),
  secondaryAreas: stringList(6, 80),
  institution: string(160),
  course: string(120),
  academicStage: string(80),
  skills: stringList(16, 60),
  availabilityHours: { type: "integer", minimum: 0, maximum: 80 },
  notes: string(800),
  avatarUrl: string(300_000),
  accountStatus: { type: "string", enum: MEMBER_STATUSES }
};

const registerBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "email", "password"],
  properties: {
    name: string(100, 2),
    email: string(254, 3),
    password: string(128, PASSWORD_MIN_LENGTH),
    institution: string(160, 2),
    course: string(120),
    academicStage: string(80),
    primaryArea: string(80),
    skills: stringList(16, 60),
    availabilityHours: { type: "integer", minimum: 0, maximum: 80 }
  }
};

const memberBody = {
  type: "object",
  additionalProperties: false,
  required: ["email"],
  properties: { ...profileProperties, teamId: string(100) }
};

const memberPatchBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { ...profileProperties, accessRole: { type: "string", enum: ACCESS_ROLES } }
};

const ownProfileBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    displayName: string(100, 2),
    institution: string(160),
    course: string(120),
    academicStage: string(80),
    availabilityHours: { type: "integer", minimum: 0, maximum: 80 },
    avatarUrl: string(300_000)
  }
};

const artifactProperties = {
  kind: { type: "string", enum: ARTIFACT_KINDS },
  label: string(140, 2),
  url: string(MAX_ARTIFACT_BODY_BYTES, 1),
  description: string(500),
  tags: stringList(12, 50),
  scope: { type: "string", enum: ["team", "project"] },
  ownerId: { anyOf: [string(100, 1), { type: "null" }] },
  fileName: string(255),
  mimeType: string(120),
  size: { type: "integer", minimum: 0, maximum: MAX_ARTIFACT_FILE_BYTES }
};

const teamBody = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: { name: string(100, 2), description: string(300) }
};

const artifactBody = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "label", "url"],
  properties: artifactProperties
};

const artifactPatchBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: artifactProperties
};

function normalizeEmail(email) {
  return email.trim().toLocaleLowerCase("en-US");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizePassword(value) {
  return value.normalize("NFKC");
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

function validatePassword(password) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) return false;
  return !COMMON_PASSWORDS.has(password.toLocaleLowerCase("en-US"));
}

function validateArtifactUrl(value) {
  const dataMatch = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/u.exec(value);
  if (dataMatch) {
    if (!SAFE_ARTIFACT_MIME_TYPES.has(dataMatch[1])) return false;
    const padding = dataMatch[2].endsWith("==") ? 2 : dataMatch[2].endsWith("=") ? 1 : 0;
    const decodedSize = Math.floor(dataMatch[2].length * 3 / 4) - padding;
    return decodedSize > 0 && decodedSize <= MAX_ARTIFACT_FILE_BYTES;
  }
  if (/^artifacts\/[a-zA-Z0-9_./-]+$/u.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateAvatarUrl(value) {
  if (!value) return true;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/u.test(value)) return value.length <= 300_000;
  if (/^\/[a-zA-Z0-9_./-]+$/u.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeTextEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function initials(name) {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function publicUser(user) {
  return {
    id: user.id,
    memberId: user.memberId,
    name: user.name,
    initials: initials(user.name),
    email: user.email,
    accessRole: user.accessRole,
    institution: user.institution,
    primaryArea: user.primaryArea,
    avatarUrl: user.avatarUrl || "",
    profileComplete: Boolean(user.institution && user.course && user.academicStage)
  };
}

function publicMember(data, member) {
  const safe = { ...member };
  delete safe.invitationCodeHash;
  delete safe.invitationExpiresAt;
  const account = member.accountId ? data.users.find((item) => item.id === member.accountId) : null;
  safe.accessRole = account?.accessRole || null;
  return safe;
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanMemberInput(body) {
  const email = normalizeEmail(body.email);
  return {
    displayName: normalizeText(body.displayName || email.split("@")[0] || "New member"),
    email,
    missionRole: body.missionRole || "member",
    primaryArea: body.primaryArea || "systems",
    secondaryAreas: normalizeList(body.secondaryAreas).filter((area) => area !== (body.primaryArea || "systems")),
    institution: normalizeText(body.institution || ""),
    course: normalizeText(body.course || ""),
    academicStage: normalizeText(body.academicStage || ""),
    skills: normalizeList(body.skills),
    availabilityHours: Number.isInteger(body.availabilityHours) ? body.availabilityHours : 0,
    notes: normalizeText(body.notes || ""),
    avatarUrl: normalizeText(body.avatarUrl || ""),
    accountStatus: body.accountStatus || "invited"
  };
}

function cleanArtifactInput(body) {
  const url = normalizeText(body.url);
  if (!validateArtifactUrl(url)) throw httpError(400, "INVALID_URL", "Use an HTTP(S) address or a supported file up to 4 MB.");
  const isFile = url.startsWith("data:");
  const fileName = [...normalizeText(body.fileName || "")].filter((character) => character.charCodeAt(0) >= 32 && !["/", "\\"].includes(character)).join("").slice(0, 255);
  const mimeType = normalizeText(body.mimeType || "").toLocaleLowerCase("en-US");
  const size = Number.isInteger(body.size) ? body.size : 0;
  if (isFile && (!fileName || !SAFE_ARTIFACT_MIME_TYPES.has(mimeType) || size <= 0 || size > MAX_ARTIFACT_FILE_BYTES || !url.startsWith(`data:${mimeType};base64,`))) {
    throw httpError(400, "INVALID_FILE", "The uploaded file metadata is invalid or unsupported.");
  }
  return {
    kind: body.kind,
    label: normalizeText(body.label),
    url,
    description: normalizeText(body.description || ""),
    tags: normalizeList(body.tags),
    scope: body.scope === "team" ? "team" : "project",
    ownerId: normalizeText(body.ownerId || null),
    fileName: isFile ? fileName : "",
    mimeType: isFile ? mimeType : "",
    size: isFile ? size : 0
  };
}

// Stored file bytes are large; the list only carries a pointer to them plus the
// server's own readability verdict, so pages never download the whole library.
const INLINE_ARTIFACT_URL_LIMIT = 8 * 1024;

function publicArtifact(artifact) {
  const stored = typeof artifact.url === "string" ? artifact.url : "";
  const next = { ...artifact, readability: artifactReadabilityRecord(artifact) };
  if (!stored.startsWith("data:")) return next;
  next.contentPath = `/artifacts/${artifact.id}/content`;
  if (stored.length > INLINE_ARTIFACT_URL_LIMIT) next.url = "";
  return next;
}

function validProjectDocument(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && value.schemaVersion === 2
    && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 100
    && value.board && typeof value.board === "object"
    && Array.isArray(value.board.nodes) && Array.isArray(value.board.links)
    && (value.engineeringSystem === undefined || validateEngineeringSystem(value.engineeringSystem))
    && (value.memoryRevision === undefined || (Number.isInteger(value.memoryRevision) && value.memoryRevision >= 0))
    && (value.systemGeneratedFromRevision === undefined || (Number.isInteger(value.systemGeneratedFromRevision) && value.systemGeneratedFromRevision >= 0))
    && (value.phaseProgress === undefined || (value.phaseProgress && [0, 1].includes(value.phaseProgress.highestUnlockedStep)));
}

function preserveProjectProgress(previous, next) {
  if (!previous || previous.id !== next.id) return next;
  const memory = (project) => ({ name: project.name, setup: project.setup, teamId: project.context?.teamId, teamArtifactIds: project.context?.teamArtifactIds, projectArtifactIds: project.context?.projectArtifactIds, programId: project.context?.programId, modalityId: project.context?.modalityId, categoryId: project.context?.categoryId });
  const changed = !isDeepStrictEqual(memory(previous), memory(next));
  return { ...next,
    memoryRevision: Math.max(next.memoryRevision || 0, (previous.memoryRevision || 0) + (changed ? 1 : 0)),
    phaseProgress: { highestUnlockedStep: Math.max(previous.phaseProgress?.highestUnlockedStep || 0, next.phaseProgress?.highestUnlockedStep || 0) },
    ...(previous.engineeringSystem && !next.engineeringSystem ? { engineeringSystem: previous.engineeringSystem, systemGeneratedFromRevision: previous.systemGeneratedFromRevision } : {})
  };
}

function markArtifactMemoryChanged(data, artifactId) {
  for (const record of Object.values(data.workspace.projects || {})) {
    const project = record?.document;
    if (![...(project?.context?.teamArtifactIds || []), ...(project?.context?.projectArtifactIds || [])].includes(artifactId)) continue;
    project.memoryRevision = (project.memoryRevision || 0) + 1;
    project.updatedAt = new Date().toISOString();
    record.updatedAt = project.updatedAt;
    record.revision = (record.revision || 0) + 1;
    if (data.workspace.project?.document?.id === project.id) data.workspace.project = record;
  }
}

function validLabBoard(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && value.schemaVersion === 1
    && Array.isArray(value.nodes) && Array.isArray(value.links)
    && value.nodes.length <= 500 && value.links.length <= 1_000;
}

export async function buildApp(options = {}) {
  const production = process.env.NODE_ENV === "production";
  const cookieName = production ? "__Host-norte_session" : "norte_session";
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const store = options.store || await (options.storeFile || !databaseUrl
    ? new JsonDataStore(options.storeFile || resolve("var/mission-dev-data.json"))
    : new PostgresDataStore(databaseUrl)).init();
  const ai = createBrainstormAiService(options.ai);
  const systemAiOptions = options.systemAi || options.ai || {};
  const initializingSystems = new Map();
  const logger = options.logger ?? {
    level: process.env.LOG_LEVEL || "info",
    redact: ["req.headers.cookie", "req.headers.authorization", "password", "body.password"]
  };
  const app = Fastify({ logger, bodyLimit: 512 * 1024, trustProxy: production });
  const systemAi = createSystemAiService({ ...systemAiOptions, onAttempt: async (record, payload) => {
    app.log.info({ event: "engineering.provider_attempt", ...record }, "Engineering provider attempt completed");
    await systemAiOptions.onAttempt?.(record, payload);
  } });

  await app.register(cookie);
  await app.register(helmet, {
    global: true,
    crossOriginResourcePolicy: { policy: "same-site" }
  });
  await app.register(rateLimit, { global: false, ipv6Subnet: 64 });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Norte API",
        version: "1.0.0",
        description: "Contas, equipe e memória de projetos de missões universitárias."
      },
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: cookieName },
          csrfToken: { type: "apiKey", in: "header", name: "x-csrf-token" }
        }
      },
      tags: [
        { name: "System", description: "Saúde e disponibilidade" },
        { name: "Authentication", description: "Cadastro e sessão" },
        { name: "Team", description: "Perfis e responsabilidades" },
        { name: "Artifacts", description: "Fontes conectadas à missão" }
      ]
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: false },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  async function setSession(reply, userId) {
    const token = randomBytes(32).toString("base64url");
    const session = {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      csrfToken: randomBytes(24).toString("base64url"),
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    await store.update((data) => {
      data.sessions = data.sessions.filter((item) => item.expiresAt > Date.now());
      data.sessions.push(session);
      return null;
    });
    reply.setCookie(cookieName, token, {
      path: "/",
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: Math.floor(SESSION_TTL_MS / 1000)
    });
    return session;
  }

  async function clearSession(request, reply) {
    const token = request.cookies[cookieName];
    if (token) {
      const tokenHash = hashToken(token);
      await store.update((data) => {
        data.sessions = data.sessions.filter((item) => item.tokenHash !== tokenHash && item.expiresAt > Date.now());
        return null;
      });
    }
    reply.clearCookie(cookieName, { path: "/", secure: production, sameSite: "strict" });
  }

  function getSessionUser(request) {
    const token = request.cookies[cookieName];
    if (!token) return null;
    const data = store.read();
    const session = data.sessions.find((item) => item.tokenHash === hashToken(token) && item.expiresAt > Date.now());
    if (!session) return null;
    const user = data.users.find((item) => item.id === session.userId && item.active);
    if (!user) return null;
    return { session, user };
  }

  async function requireAuth(request) {
    const auth = getSessionUser(request);
    if (!auth) throw httpError(401, "AUTH_REQUIRED", "Authentication is required.");
    request.auth = auth;
  }

  async function requireCsrf(request) {
    if (!request.auth) await requireAuth(request);
    const received = request.headers["x-csrf-token"];
    if (typeof received !== "string" || !constantTimeTextEqual(received, request.auth.session.csrfToken)) {
      throw httpError(403, "CSRF_INVALID", "The request verification token is missing or invalid.");
    }
  }

  function requireRole(user, allowed) {
    if (!allowed.includes(user.accessRole)) throw httpError(403, "FORBIDDEN", "Your project role cannot perform this action.");
  }

  function requireTeamRole(user, allowedAccessRoles, allowedProjectRoles) {
    if (allowedAccessRoles.includes(user.accessRole)) return;
    const data = store.read();
    const records = Object.values(data.workspace.projects || {});
    const allowed = records.some((record) => record?.document?.context?.assignments?.some((item) => item.memberId === user.memberId && allowedProjectRoles.includes(item.roleId)));
    if (!allowed) {
      throw httpError(403, "FORBIDDEN", "Your project role cannot perform this action.");
    }
  }

  function canManageNamedTeam(data, user, team) {
    if (user.accessRole === "owner_admin") return true;
    if (team?.createdBy === user.id) return true;
    if (team?.memberIds.includes(user.memberId) && ["captain", "manager"].includes(user.accessRole)) return true;
    return Object.values(data.workspace.projects || {}).some((record) => {
      const context = record?.document?.context;
      return context?.teamId === team?.id && context.assignments?.some((item) => item.memberId === user.memberId && ["captain", "manager"].includes(item.roleId));
    });
  }

  function requireNamedTeamManager(data, user, team) {
    if (!team || !canManageNamedTeam(data, user, team)) throw httpError(403, "FORBIDDEN", "You cannot manage this team.");
  }

  function canAccessProject(data, user, record) {
    if (user.accessRole === "owner_admin" || record?.createdBy === user.id || record?.updatedBy === user.id) return true;
    const teamId = record?.document?.context?.teamId;
    const team = data.teams.find((item) => item.id === teamId);
    return Boolean(team?.memberIds.includes(user.memberId));
  }

  /** One visibility rule for both the artifact list and its file downloads. */
  function visibleArtifacts(data, user) {
    if (user.accessRole === "owner_admin") return data.artifacts;
    const teamIds = new Set(data.teams.filter((team) => team.memberIds.includes(user.memberId)).map((team) => team.id));
    const projectIds = new Set(Object.entries(data.workspace.projects || {}).filter(([, record]) => canAccessProject(data, user, record)).map(([projectId]) => projectId));
    return data.artifacts.filter((artifact) => artifact.official
      || artifact.createdBy === user.id
      || (artifact.scope === "team" && teamIds.has(artifact.ownerId))
      || (artifact.scope === "project" && projectIds.has(artifact.ownerId)));
  }

  function projectSummary(record) {
    const project = record.document;
    return {
      id: project.id,
      name: project.name || "Projeto sem título",
      programId: project.context?.programId ?? null,
      teamId: project.context?.teamId ?? null,
      updatedAt: record.updatedAt || project.updatedAt,
      memberCount: Array.isArray(project.context?.assignments) ? project.context.assignments.length : 0
    };
  }

  app.addHook("onRequest", async (request) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (!origin) return;
    const allowedOrigins = new Set((process.env.NORTE_ALLOWED_ORIGINS || process.env.MISSION_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173").split(",").map((item) => item.trim()));
    const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
    const sameHost = (() => {
      try {
        return new URL(origin).host === forwardedHost;
      } catch {
        return false;
      }
    })();
    if (!sameHost && !allowedOrigins.has(origin)) throw httpError(403, "ORIGIN_REJECTED", "Request origin is not allowed.");
  });

  app.get("/api/health", {
    schema: { tags: ["System"], summary: "Check API health" }
  }, async () => {
    await store.health?.();
    return { status: "ok", version: "1.0.0", storage: databaseUrl ? "postgresql" : "local" };
  });

  app.get("/api/auth/session", {
    schema: { tags: ["Authentication"], summary: "Read the current session" }
  }, async (request) => {
    const auth = getSessionUser(request);
    const hasOwner = store.read().users.some((user) => user.accessRole === "owner_admin" && user.active);
    if (!auth) return { authenticated: false, hasOwner };
    return { authenticated: true, hasOwner, user: publicUser(auth.user), csrfToken: auth.session.csrfToken };
  });

  app.post("/api/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: { tags: ["Authentication"], summary: "Create an account", body: registerBody }
  }, async (request, reply) => {
    const body = request.body;
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    if (!validateEmail(email)) throw httpError(400, "INVALID_EMAIL", "Enter a valid email address.");
    if (!validatePassword(password)) throw httpError(400, "WEAK_PASSWORD", `Use a passphrase with at least ${PASSWORD_MIN_LENGTH} characters.`);
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });

    const user = await store.update((data) => {
      if (data.users.some((item) => item.email === email)) throw httpError(409, "EMAIL_EXISTS", "An account already uses this email.");
      const timestamp = new Date().toISOString();
      const isFirstAccount = !data.users.some((item) => item.accessRole === "owner_admin" && item.active);
      const invitedMember = data.members.find((item) => item.email === email && !item.accountId);
      const memberId = invitedMember?.id || randomUUID();
      const nextUser = {
        id: randomUUID(),
        memberId,
        name: normalizeText(body.name),
        email,
        passwordHash,
        accessRole: isFirstAccount ? "owner_admin" : invitedMember?.missionRole === "advisor" ? "advisor" : "member",
        institution: normalizeText(body.institution || ""),
        course: normalizeText(body.course || ""),
        academicStage: normalizeText(body.academicStage || ""),
        availabilityHours: Number.isInteger(body.availabilityHours) ? body.availabilityHours : 0,
        avatarUrl: normalizeText(body.avatarUrl || ""),
        primaryArea: invitedMember?.primaryArea || body.primaryArea || "systems",
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: timestamp
      };
      data.users.push(nextUser);
      if (invitedMember) {
        invitedMember.accountId = nextUser.id;
        invitedMember.displayName = nextUser.name;
        invitedMember.institution = nextUser.institution;
        invitedMember.course = normalizeText(body.course || invitedMember.course || "");
        invitedMember.academicStage = normalizeText(body.academicStage || invitedMember.academicStage || "");
        invitedMember.skills = normalizeList(body.skills).length ? normalizeList(body.skills) : invitedMember.skills;
        invitedMember.availabilityHours = Number.isInteger(body.availabilityHours) ? body.availabilityHours : invitedMember.availabilityHours;
        invitedMember.avatarUrl = normalizeText(body.avatarUrl || invitedMember.avatarUrl || "");
        invitedMember.accountStatus = "active";
        invitedMember.updatedAt = timestamp;
        delete invitedMember.invitationCodeHash;
        delete invitedMember.invitationExpiresAt;
      } else {
        data.members.push({
          id: memberId,
          accountId: nextUser.id,
          displayName: nextUser.name,
          email,
          missionRole: "captain",
          primaryArea: body.primaryArea || "systems",
          secondaryAreas: [],
          institution: nextUser.institution,
          course: normalizeText(body.course || ""),
          academicStage: normalizeText(body.academicStage || ""),
          skills: normalizeList(body.skills),
          availabilityHours: Number.isInteger(body.availabilityHours) ? body.availabilityHours : 0,
          notes: "",
          avatarUrl: normalizeText(body.avatarUrl || ""),
          accountStatus: "active",
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
      if (isFirstAccount && data.teams[0]) {
        data.teams[0].memberIds = [...new Set([...data.teams[0].memberIds, memberId])];
        data.teams[0].createdBy ||= nextUser.id;
        data.teams[0].updatedAt = timestamp;
      }
      return nextUser;
    });
    const session = await setSession(reply, user.id);
    reply.code(201);
    return { user: publicUser(user), csrfToken: session.csrfToken };
  });

  app.post("/api/auth/login", {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
    schema: {
      tags: ["Authentication"],
      summary: "Start a secure session",
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: { email: string(254, 3), password: string(128, 1) }
      }
    }
  }, async (request, reply) => {
    const email = normalizeEmail(request.body.email);
    const password = normalizePassword(request.body.password);
    const user = store.read().users.find((item) => item.email === email && item.active);
    const valid = user ? await argon2.verify(user.passwordHash, password).catch(() => false) : false;
    if (!valid) throw httpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    await store.update((data) => {
      const storedUser = data.users.find((item) => item.id === user.id);
      if (storedUser) {
        storedUser.lastLoginAt = new Date().toISOString();
        storedUser.updatedAt = storedUser.lastLoginAt;
      }
      return null;
    });
    const session = await setSession(reply, user.id);
    return { user: publicUser(user), csrfToken: session.csrfToken };
  });

  app.post("/api/auth/logout", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["Authentication"], summary: "End the current session", security: [{ sessionCookie: [], csrfToken: [] }] }
  }, async (request, reply) => {
    await clearSession(request, reply);
    reply.code(204).send();
  });

  app.get("/api/profile", {
    preHandler: [requireAuth],
    schema: { tags: ["Authentication"], summary: "Read the current academic profile", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    const member = data.members.find((item) => item.id === request.auth.user.memberId);
    if (!member) throw httpError(404, "PROFILE_NOT_FOUND", "Your profile was not found.");
    return { profile: publicMember(data, member) };
  });

  app.patch("/api/profile", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["Authentication"], summary: "Update the current academic profile", security: [{ sessionCookie: [], csrfToken: [] }], body: ownProfileBody }
  }, async (request) => {
    if (request.body.avatarUrl !== undefined && !validateAvatarUrl(request.body.avatarUrl)) {
      throw httpError(400, "INVALID_AVATAR", "Use a valid profile image.");
    }
    const profile = await store.update((data) => {
      const member = data.members.find((item) => item.id === request.auth.user.memberId);
      const user = data.users.find((item) => item.id === request.auth.user.id);
      if (!member || !user) throw httpError(404, "PROFILE_NOT_FOUND", "Your profile was not found.");
      for (const key of ["displayName", "institution", "course", "academicStage", "avatarUrl"]) {
        if (request.body[key] !== undefined) member[key] = normalizeText(request.body[key]);
      }
      if (request.body.availabilityHours !== undefined) member.availabilityHours = request.body.availabilityHours;
      user.name = member.displayName;
      user.institution = member.institution;
      user.course = member.course;
      user.academicStage = member.academicStage;
      user.availabilityHours = member.availabilityHours;
      user.avatarUrl = member.avatarUrl || "";
      member.updatedAt = new Date().toISOString();
      user.updatedAt = member.updatedAt;
      return member;
    });
    const data = store.read();
    return { profile: publicMember(data, profile), user: publicUser(data.users.find((item) => item.id === request.auth.user.id)) };
  });

  app.get("/api/teams", {
    preHandler: [requireAuth],
    schema: { tags: ["Team"], summary: "List available and associated teams", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    return {
      teams: data.teams.map((team) => {
        const membership = team.memberIds.includes(request.auth.user.memberId) ? "member" : team.joinRequests.includes(request.auth.user.memberId) ? "requested" : "available";
        const canManage = canManageNamedTeam(data, request.auth.user, team);
        const canSeePrivateData = membership === "member" || canManage;
        return {
          ...team,
          memberIds: canSeePrivateData ? team.memberIds : [],
          artifactIds: canSeePrivateData ? team.artifactIds : [],
          joinRequests: canManage ? team.joinRequests : [],
          createdBy: canSeePrivateData ? team.createdBy : null,
          memberCount: team.memberIds.length,
          artifactCount: team.artifactIds.length,
          projectCount: team.projectCount ?? Object.values(data.workspace.projects || {}).filter((record) => record?.document?.context?.teamId === team.id).length,
          membership,
          canManage
        };
      })
    };
  });

  app.get("/api/teams/:id/projects", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Team"], summary: "List a team's projects and project participants", security: [{ sessionCookie: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(100, 1) } }
    }
  }, async (request) => {
    const data = store.read();
    const team = data.teams.find((item) => item.id === request.params.id);
    if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team was not found.");
    if (!team.memberIds.includes(request.auth.user.memberId) && !canManageNamedTeam(data, request.auth.user, team)) {
      throw httpError(403, "FORBIDDEN", "Join this team to see its projects.");
    }
    const projects = Object.values(data.workspace.projects || {})
      .filter((record) => record?.document?.context?.teamId === team.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map((record) => {
        const context = record.document.context || {};
        const roles = new Map((context.roles || []).map((item) => [item.id, item.name]));
        const sectors = new Map((context.sectors || []).map((item) => [item.id, item.name]));
        return {
          ...projectSummary(record),
          participants: (context.assignments || []).map((assignment) => {
            const member = data.members.find((item) => item.id === assignment.memberId);
            return {
              memberId: assignment.memberId,
              displayName: member?.displayName || "Member",
              avatarUrl: member?.avatarUrl || "",
              roleId: assignment.roleId,
              roleName: roles.get(assignment.roleId) || assignment.roleId,
              sectorId: assignment.sectorId,
              sectorName: sectors.get(assignment.sectorId) || ""
            };
          })
        };
      });
    return { projects, validationResetId: data.workspace.validationResetId ?? null };
  });

  app.get("/api/directory/members", {
    preHandler: [requireAuth],
    schema: { tags: ["Team"], summary: "List public member profiles and approximate presence", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    const now = Date.now();
    return {
      members: data.users.filter((user) => user.active).map((user) => {
        const member = data.members.find((item) => item.id === user.memberId);
        const lastSeen = Date.parse(user.lastLoginAt || user.updatedAt || user.createdAt || "");
        const elapsed = Number.isFinite(lastSeen) ? now - lastSeen : Number.POSITIVE_INFINITY;
        const presence = user.id === request.auth.user.id || elapsed <= 15 * 60 * 1000 ? "online" : elapsed <= 7 * 24 * 60 * 60 * 1000 ? "recent" : "offline";
        return {
          id: user.id,
          displayName: member?.displayName || user.name,
          institution: member?.institution || user.institution || "",
          course: member?.course || user.course || "",
          avatarUrl: member?.avatarUrl || user.avatarUrl || "",
          presence
        };
      })
    };
  });

  app.post("/api/teams", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["Team"], summary: "Create a team", security: [{ sessionCookie: [], csrfToken: [] }], body: teamBody }
  }, async (request, reply) => {
    const team = await store.update((data) => {
      const timestamp = new Date().toISOString();
      const next = {
        id: randomUUID(),
        name: normalizeText(request.body.name),
        description: normalizeText(request.body.description || ""),
        memberIds: [request.auth.user.memberId],
        artifactIds: [],
        joinRequests: [],
        createdBy: request.auth.user.id,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      data.teams.push(next);
      return next;
    });
    reply.code(201);
    return { team: { ...team, membership: "member", canManage: true } };
  });

  app.patch("/api/teams/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"], summary: "Update a team", security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(100, 1) } },
      body: { type: "object", additionalProperties: false, minProperties: 1, properties: { name: string(100, 2), description: string(300) } }
    }
  }, async (request) => {
    const team = await store.update((data) => {
      const existing = data.teams.find((item) => item.id === request.params.id);
      requireNamedTeamManager(data, request.auth.user, existing);
      if (request.body.name !== undefined) existing.name = normalizeText(request.body.name);
      if (request.body.description !== undefined) existing.description = normalizeText(request.body.description);
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return { team };
  });

  app.delete("/api/teams/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"], summary: "Delete a team that is not connected to a project", security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(100, 1) } }
    }
  }, async (request, reply) => {
    await store.update((data) => {
      const index = data.teams.findIndex((item) => item.id === request.params.id);
      if (index < 0) throw httpError(404, "TEAM_NOT_FOUND", "Team was not found.");
      const team = data.teams[index];
      requireNamedTeamManager(data, request.auth.user, team);
      const projectUsesTeam = Object.values(data.workspace.projects || {}).some((record) => record?.document?.context?.teamId === team.id);
      if (projectUsesTeam) throw httpError(409, "TEAM_IN_USE", "Move or delete the projects connected to this team first.");
      const artifactIds = new Set(team.artifactIds);
      data.artifacts = data.artifacts.filter((artifact) => !artifactIds.has(artifact.id) && !(artifact.scope === "team" && artifact.ownerId === team.id));
      data.teams.splice(index, 1);
      return null;
    });
    reply.code(204).send();
  });

  app.post("/api/teams/:id/join-requests", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"], summary: "Request team membership", security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(100, 1) } }
    }
  }, async (request) => {
    const team = await store.update((data) => {
      const existing = data.teams.find((item) => item.id === request.params.id);
      if (!existing) throw httpError(404, "TEAM_NOT_FOUND", "Team was not found.");
      if (!existing.memberIds.includes(request.auth.user.memberId)) existing.joinRequests = [...new Set([...existing.joinRequests, request.auth.user.memberId])];
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return { team };
  });

  app.post("/api/teams/:id/members", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"], summary: "Add an existing profile to a team", security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(100, 1) } },
      body: { type: "object", additionalProperties: false, required: ["memberId"], properties: { memberId: string(100, 1) } }
    }
  }, async (request) => {
    const team = await store.update((data) => {
      const existing = data.teams.find((item) => item.id === request.params.id);
      requireNamedTeamManager(data, request.auth.user, existing);
      if (!data.members.some((member) => member.id === request.body.memberId)) throw httpError(404, "MEMBER_NOT_FOUND", "Team member was not found.");
      existing.memberIds = [...new Set([...existing.memberIds, request.body.memberId])];
      existing.joinRequests = existing.joinRequests.filter((memberId) => memberId !== request.body.memberId);
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return { team };
  });

  app.delete("/api/teams/:id/members/:memberId", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"], summary: "Remove a profile from a team without deleting the account", security: [{ sessionCookie: [], csrfToken: [] }],
      params: {
        type: "object",
        additionalProperties: false,
        required: ["id", "memberId"],
        properties: { id: string(100, 1), memberId: string(100, 1) }
      }
    }
  }, async (request, reply) => {
    await store.update((data) => {
      const team = data.teams.find((item) => item.id === request.params.id);
      requireNamedTeamManager(data, request.auth.user, team);
      if (!team.memberIds.includes(request.params.memberId)) throw httpError(404, "MEMBER_NOT_FOUND", "This profile is not part of the team.");
      team.memberIds = team.memberIds.filter((memberId) => memberId !== request.params.memberId);
      team.joinRequests = team.joinRequests.filter((memberId) => memberId !== request.params.memberId);
      team.updatedAt = new Date().toISOString();
      for (const record of Object.values(data.workspace.projects || {})) {
        if (record?.document?.context?.teamId !== team.id) continue;
        record.document.context.assignments = (record.document.context.assignments || []).filter((assignment) => assignment.memberId !== request.params.memberId);
      }
      return null;
    });
    reply.code(204).send();
  });

  app.get("/api/team/members", {
    preHandler: [requireAuth],
    schema: { tags: ["Team"], summary: "List mission team profiles", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    if (request.auth.user.accessRole === "owner_admin") return { members: data.members.map((member) => publicMember(data, member)) };
    const visibleMemberIds = new Set([request.auth.user.memberId]);
    for (const team of data.teams) {
      if (!team.memberIds.includes(request.auth.user.memberId) && !canManageNamedTeam(data, request.auth.user, team)) continue;
      team.memberIds.forEach((memberId) => visibleMemberIds.add(memberId));
      if (canManageNamedTeam(data, request.auth.user, team)) team.joinRequests.forEach((memberId) => visibleMemberIds.add(memberId));
    }
    return { members: data.members.filter((member) => visibleMemberIds.has(member.id)).map((member) => publicMember(data, member)) };
  });

  app.post("/api/team/members", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["Team"], summary: "Add or invite a team profile", security: [{ sessionCookie: [], csrfToken: [] }], body: memberBody }
  }, async (request, reply) => {
    const requestedTeamId = normalizeText(request.body.teamId || "");
    const currentData = store.read();
    if (requestedTeamId) requireNamedTeamManager(currentData, request.auth.user, currentData.teams.find((team) => team.id === requestedTeamId));
    else requireTeamRole(request.auth.user, ["owner_admin", "captain", "manager"], ["captain", "manager"]);
    const input = cleanMemberInput(request.body);
    if (!validateEmail(input.email)) throw httpError(400, "INVALID_EMAIL", "Enter a valid email address.");
    if (request.auth.user.accessRole === "manager" && input.missionRole !== "member") throw httpError(403, "FORBIDDEN", "Managers can invite members only.");
    const member = await store.update((data) => {
      const existingMember = data.members.find((item) => item.email === input.email);
      if (existingMember) {
        if (!requestedTeamId) throw httpError(409, "MEMBER_EXISTS", "A team profile already uses this email.");
        const team = data.teams.find((item) => item.id === requestedTeamId);
        if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team was not found.");
        team.memberIds = [...new Set([...team.memberIds, existingMember.id])];
        team.updatedAt = new Date().toISOString();
        return existingMember;
      }
      const timestamp = new Date().toISOString();
      const next = {
        id: randomUUID(),
        accountId: null,
        ...input,
        accountStatus: "invited",
        createdAt: timestamp,
        updatedAt: timestamp
      };
      data.members.push(next);
      if (requestedTeamId) {
        const team = data.teams.find((item) => item.id === requestedTeamId);
        if (!team) throw httpError(404, "TEAM_NOT_FOUND", "Team was not found.");
        team.memberIds = [...new Set([...team.memberIds, next.id])];
        team.updatedAt = timestamp;
      }
      return next;
    });
    reply.code(201);
    return { member: publicMember(store.read(), member) };
  });

  app.post("/api/team/members/:id/invitation", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"],
      summary: "Mark a profile as awaiting account registration",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } }
    }
  }, async (request) => {
    requireTeamRole(request.auth.user, ["owner_admin", "captain"], ["captain"]);
    const member = await store.update((data) => {
      const existing = data.members.find((item) => item.id === request.params.id);
      if (!existing) throw httpError(404, "MEMBER_NOT_FOUND", "Team member was not found.");
      if (existing.accountId) throw httpError(409, "ACCOUNT_EXISTS", "This profile already has an account.");
      existing.accountStatus = "invited";
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return { member: publicMember(store.read(), member) };
  });

  app.patch("/api/team/members/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"],
      summary: "Update a team profile",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } },
      body: memberPatchBody
    }
  }, async (request) => {
    const currentUser = request.auth.user;
    const isSelf = currentUser.memberId === request.params.id;
    if (!isSelf) requireTeamRole(currentUser, ["owner_admin", "captain", "manager"], ["captain", "manager"]);
    const member = await store.update((data) => {
      const existing = data.members.find((item) => item.id === request.params.id);
      if (!existing) throw httpError(404, "MEMBER_NOT_FOUND", "Team member was not found.");
      const body = request.body;
      if (body.email !== undefined) {
        const email = normalizeEmail(body.email);
        if (!validateEmail(email)) throw httpError(400, "INVALID_EMAIL", "Enter a valid email address.");
        if (existing.accountId && email !== existing.email) throw httpError(409, "ACCOUNT_EMAIL_LOCKED", "Change an active account email through the account security flow.");
        if (data.members.some((item) => item.id !== existing.id && item.email === email)) throw httpError(409, "MEMBER_EXISTS", "A team profile already uses this email.");
        existing.email = email;
      }
      const ownEditable = ["displayName", "primaryArea", "secondaryAreas", "institution", "course", "academicStage", "skills", "availabilityHours", "notes"];
      const managerEditable = [...ownEditable, "missionRole", "accountStatus"];
      const editable = isSelf && !["owner_admin", "captain", "manager"].includes(currentUser.accessRole) ? ownEditable : managerEditable;
      for (const key of editable) {
        if (body[key] === undefined) continue;
        existing[key] = ["secondaryAreas", "skills"].includes(key) ? normalizeList(body[key]) : normalizeText(body[key]);
      }
      if (existing.secondaryAreas) existing.secondaryAreas = existing.secondaryAreas.filter((area) => area !== existing.primaryArea);
      if (existing.accountId) {
        const account = data.users.find((item) => item.id === existing.accountId);
        if (account) {
          account.name = existing.displayName;
          account.institution = existing.institution;
          account.updatedAt = new Date().toISOString();
        }
      }
      if (body.accessRole !== undefined) {
        requireRole(currentUser, ["owner_admin"]);
        if (!existing.accountId) throw httpError(409, "ACCOUNT_REQUIRED", "This profile does not have an account yet.");
        const account = data.users.find((item) => item.id === existing.accountId);
        if (account?.accessRole === "owner_admin" && body.accessRole !== "owner_admin" && data.users.filter((item) => item.active && item.accessRole === "owner_admin").length === 1) {
          throw httpError(409, "LAST_OWNER", "The team must keep at least one owner administrator.");
        }
        if (account) account.accessRole = body.accessRole;
      }
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return { member: publicMember(store.read(), member) };
  });

  app.delete("/api/team/members/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Team"],
      summary: "Remove an unlinked team profile",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } }
    }
  }, async (request, reply) => {
    requireTeamRole(request.auth.user, ["owner_admin", "captain"], ["captain"]);
    await store.update((data) => {
      const index = data.members.findIndex((item) => item.id === request.params.id);
      if (index < 0) throw httpError(404, "MEMBER_NOT_FOUND", "Team member was not found.");
      if (data.members[index].accountId) throw httpError(409, "MEMBER_HAS_ACCOUNT", "Deactivate the account before removing this profile.");
      const memberId = data.members[index].id;
      data.members.splice(index, 1);
      for (const team of data.teams) team.memberIds = team.memberIds.filter((id) => id !== memberId);
      for (const record of Object.values(data.workspace.projects || {})) {
        const assignments = record?.document?.context?.assignments;
        if (Array.isArray(assignments)) record.document.context.assignments = assignments.filter((assignment) => assignment.memberId !== memberId);
      }
      return null;
    });
    reply.code(204).send();
  });

  app.get("/api/artifacts", {
    preHandler: [requireAuth],
    schema: { tags: ["Artifacts"], summary: "List connected mission sources", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    return { artifacts: visibleArtifacts(data, request.auth.user).map(publicArtifact) };
  });

  app.get("/api/artifacts/:id/content", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Artifacts"],
      summary: "Download the stored bytes of a connected file",
      security: [{ sessionCookie: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } }
    }
  }, async (request, reply) => {
    const data = store.read();
    const artifact = visibleArtifacts(data, request.auth.user).find((item) => item.id === request.params.id);
    if (!artifact) throw httpError(404, "ARTIFACT_NOT_FOUND", "Connected source was not found.");
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(artifact.url || "");
    if (!match || !SAFE_ARTIFACT_MIME_TYPES.has(match[1])) throw httpError(404, "ARTIFACT_NO_CONTENT", "This source is a link; Norte has not stored its file.");
    const fileName = (artifact.fileName || `${artifact.id}`).replace(/[^\w.-]/gu, "_");
    return reply
      .header("Content-Type", match[1])
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, no-store")
      .send(Buffer.from(match[2], "base64"));
  });

  app.post("/api/artifacts", {
    bodyLimit: MAX_ARTIFACT_BODY_BYTES,
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["Artifacts"], summary: "Connect a source or artifact", security: [{ sessionCookie: [], csrfToken: [] }], body: artifactBody }
  }, async (request, reply) => {
    if (request.auth.user.accessRole === "advisor") throw httpError(403, "FORBIDDEN", "Advisors have read-only access to connected sources.");
    const input = cleanArtifactInput(request.body);
    const artifact = await store.update((data) => {
      if (input.scope === "team") {
        const team = data.teams.find((item) => item.id === input.ownerId);
        requireNamedTeamManager(data, request.auth.user, team);
      } else if (input.ownerId) {
        const record = data.workspace.projects?.[input.ownerId];
        if (record && !canAccessProject(data, request.auth.user, record)) throw httpError(403, "FORBIDDEN", "You cannot update this project.");
      }
      const timestamp = new Date().toISOString();
      const next = { id: randomUUID(), ...input, official: false, createdBy: request.auth.user.id, connectedAt: timestamp, updatedAt: timestamp };
      data.artifacts.push(next);
      if (next.scope === "team") {
        const team = data.teams.find((item) => item.id === next.ownerId);
        team.artifactIds = [...new Set([...team.artifactIds, next.id])];
        team.updatedAt = timestamp;
      }
      return next;
    });
    reply.code(201);
    return { artifact: publicArtifact(artifact) };
  });

  app.patch("/api/artifacts/:id", {
    bodyLimit: MAX_ARTIFACT_BODY_BYTES,
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Artifacts"],
      summary: "Update a connected source",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } },
      body: artifactPatchBody
    }
  }, async (request) => {
    const artifact = await store.update((data) => {
      const existing = data.artifacts.find((item) => item.id === request.params.id);
      if (!existing) throw httpError(404, "ARTIFACT_NOT_FOUND", "Connected source was not found.");
      if (existing.official) requireRole(request.auth.user, ["owner_admin"]);
      else if (existing.scope === "team") requireNamedTeamManager(data, request.auth.user, data.teams.find((team) => team.id === existing.ownerId));
      else if (existing.createdBy !== request.auth.user.id) requireRole(request.auth.user, ["owner_admin", "captain", "manager"]);
      const merged = cleanArtifactInput({ ...existing, ...request.body, scope: existing.scope, ownerId: existing.ownerId });
      Object.assign(existing, merged, { updatedAt: new Date().toISOString() });
      markArtifactMemoryChanged(data, existing.id);
      return existing;
    });
    return { artifact: publicArtifact(artifact) };
  });

  app.delete("/api/artifacts/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["Artifacts"],
      summary: "Disconnect a non-official source",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: string(80, 1) } }
    }
  }, async (request, reply) => {
    await store.update((data) => {
      const index = data.artifacts.findIndex((item) => item.id === request.params.id);
      if (index < 0) throw httpError(404, "ARTIFACT_NOT_FOUND", "Connected source was not found.");
      const artifact = data.artifacts[index];
      if (artifact.official) throw httpError(409, "OFFICIAL_SOURCE", "Official mission references cannot be disconnected.");
      if (artifact.scope === "team") requireNamedTeamManager(data, request.auth.user, data.teams.find((team) => team.id === artifact.ownerId));
      else if (artifact.createdBy !== request.auth.user.id) requireRole(request.auth.user, ["owner_admin", "captain", "manager"]);
      markArtifactMemoryChanged(data, artifact.id);
      data.artifacts.splice(index, 1);
      for (const team of data.teams) team.artifactIds = team.artifactIds.filter((id) => id !== artifact.id);
      for (const record of Object.values(data.workspace.projects || {})) {
        const context = record?.document?.context;
        if (!context) continue;
        context.teamArtifactIds = (context.teamArtifactIds || []).filter((id) => id !== artifact.id);
        context.projectArtifactIds = (context.projectArtifactIds || []).filter((id) => id !== artifact.id);
      }
      return null;
    });
    reply.code(204).send();
  });

  app.get("/api/brainstorm-ai/status", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "Check the private organization engine", security: [{ sessionCookie: [] }] }
  }, async () => ai.status());

  app.post("/api/brainstorm-ai/analyze", {
    preHandler: [requireAuth, requireCsrf],
    config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    schema: {
      tags: ["System"],
      summary: "Analyze or organize a brainstorming map",
      security: [{ sessionCookie: [], csrfToken: [] }],
      body: brainstormRequestSchema
    }
  }, async (request) => ai.analyze(request.body));

  app.get("/api/system-ai/status", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "Check engineering extraction availability", security: [{ sessionCookie: [] }] }
  }, async () => systemAi.status());

  app.post("/api/system-ai/generate", {
    preHandler: [requireAuth, requireCsrf],
    config: { rateLimit: { max: 12, timeWindow: "1 hour" } },
    schema: { tags: ["System"], summary: "Initialize engineering architecture from this project's persisted artifacts", security: [{ sessionCookie: [], csrfToken: [] }], body: generationRequestSchema }
  }, async (request) => {
    const data = store.read();
    const record = data.workspace.projects?.[request.body.projectId];
    if (!record) throw httpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    if (!canAccessProject(data, request.auth.user, record)) throw httpError(403, "FORBIDDEN", "You cannot open this project.");
    if (request.auth.user.accessRole === "advisor") throw httpError(403, "FORBIDDEN", "Advisors have read-only access to the project workspace.");
    const project = record.document;
    if (project.engineeringSystem) return { engineeringSystem: project.engineeringSystem, memoryRevision: project.memoryRevision || 0 };
    if (initializingSystems.has(project.id)) return initializingSystems.get(project.id);
    const memoryFingerprint = JSON.stringify({ revision: project.memoryRevision || 0, context: project.context, setup: project.setup, artifacts: projectArtifacts(project, data.artifacts) });
    const operation = (async () => {
      const engineeringSystem = await systemAi.generate(project, data.artifacts, request.body.language);
      return store.update((current) => {
        const latest = current.workspace.projects?.[project.id];
        if (!latest) throw httpError(409, "PROJECT_CHANGED", "This project changed during initialization.");
        if (!canAccessProject(current, request.auth.user, latest)) throw httpError(403, "FORBIDDEN", "Project access changed during initialization.");
        if (latest.document.engineeringSystem) return { engineeringSystem: latest.document.engineeringSystem, memoryRevision: latest.document.memoryRevision || 0 };
        const latestFingerprint = JSON.stringify({ revision: latest.document.memoryRevision || 0, context: latest.document.context, setup: latest.document.setup, artifacts: projectArtifacts(latest.document, current.artifacts) });
        if (memoryFingerprint !== latestFingerprint) throw httpError(409, "PROJECT_MEMORY_CHANGED", "Project memory changed during initialization. Retry with the current memory.");
        latest.document = { ...latest.document, engineeringSystem, phaseProgress: { highestUnlockedStep: 1 }, systemGeneratedFromRevision: engineeringSystem.generatedFromRevision, updatedAt: new Date().toISOString() };
        latest.revision = (latest.revision || 0) + 1;
        latest.updatedAt = latest.document.updatedAt;
        latest.updatedBy = request.auth.user.id;
        if (current.workspace.project?.document?.id === project.id) current.workspace.project = latest;
        return { engineeringSystem, memoryRevision: latest.document.memoryRevision || 0 };
      });
    })();
    initializingSystems.set(project.id, operation);
    try { return await operation; } finally { initializingSystems.delete(project.id); }
  });

  app.post("/api/system-ai/analyze-change", {
    preHandler: [requireAuth, requireCsrf],
    bodyLimit: 2 * 1024 * 1024,
    config: { rateLimit: { max: 60, timeWindow: "1 hour" } },
    schema: { tags: ["System"], summary: "Analyze a temporary engineering scenario with auditable calculations", security: [{ sessionCookie: [], csrfToken: [] }], body: analysisRequestSchema }
  }, async (request) => systemAi.analyze(request.body.engineeringSystem, request.body.change, request.body.language));

  const projectParams = {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: string(100, 1) }
  };

  app.get("/api/projects", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "List projects associated with the account", security: [{ sessionCookie: [] }] }
  }, async (request) => {
    const data = store.read();
    const projects = Object.values(data.workspace.projects || {})
      .filter((record) => canAccessProject(data, request.auth.user, record))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map(projectSummary);
    return { projects, validationResetId: data.workspace.validationResetId ?? null };
  });

  app.post("/api/projects", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["System"], summary: "Create a project", security: [{ sessionCookie: [], csrfToken: [] }], body: { type: "object", additionalProperties: true } }
  }, async (request, reply) => {
    if (!validProjectDocument(request.body)) throw httpError(400, "INVALID_PROJECT", "The project document is invalid or unsupported.");
    const record = await store.update((data) => {
      if (data.workspace.projects[request.body.id]) throw httpError(409, "PROJECT_EXISTS", "A project with this identifier already exists.");
      const teamId = request.body.context?.teamId;
      if (teamId) {
        const team = data.teams.find((item) => item.id === teamId);
        if (!team || (request.auth.user.accessRole !== "owner_admin" && !team.memberIds.includes(request.auth.user.memberId))) throw httpError(403, "FORBIDDEN", "Join the selected team before creating this project.");
      }
      const timestamp = new Date().toISOString();
      const next = { document: request.body, revision: 1, createdAt: timestamp, createdBy: request.auth.user.id, updatedAt: timestamp, updatedBy: request.auth.user.id };
      data.workspace.projects[request.body.id] = next;
      data.workspace.project = next;
      return next;
    });
    reply.code(201);
    return { project: record.document, revision: record.revision, updatedAt: record.updatedAt };
  });

  app.get("/api/projects/:id", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "Open an associated project", security: [{ sessionCookie: [] }], params: projectParams }
  }, async (request) => {
    const data = store.read();
    const record = data.workspace.projects?.[request.params.id];
    if (!record) throw httpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    if (!canAccessProject(data, request.auth.user, record)) throw httpError(403, "FORBIDDEN", "You cannot open this project.");
    return { project: record.document, revision: record.revision, updatedAt: record.updatedAt };
  });

  app.put("/api/projects/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["System"], summary: "Persist an associated project", security: [{ sessionCookie: [], csrfToken: [] }], params: projectParams, body: { type: "object", additionalProperties: true } }
  }, async (request) => {
    if (request.auth.user.accessRole === "advisor") throw httpError(403, "FORBIDDEN", "Advisors have read-only access to the project workspace.");
    if (request.body.id !== request.params.id || !validProjectDocument(request.body)) throw httpError(400, "INVALID_PROJECT", "The project document is invalid or unsupported.");
    return store.update((data) => {
      const previous = data.workspace.projects?.[request.params.id];
      if (!previous) throw httpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
      if (!canAccessProject(data, request.auth.user, previous)) throw httpError(403, "FORBIDDEN", "You cannot update this project.");
      const nextTeamId = request.body.context?.teamId;
      if (nextTeamId) {
        const nextTeam = data.teams.find((item) => item.id === nextTeamId);
        if (!nextTeam || (request.auth.user.accessRole !== "owner_admin" && !nextTeam.memberIds.includes(request.auth.user.memberId))) {
          throw httpError(403, "FORBIDDEN", "Join the selected team before connecting it to this project.");
        }
      }
      if (!isDeepStrictEqual(previous.document.context, request.body.context)) {
        const team = data.teams.find((item) => item.id === previous.document.context?.teamId);
        const projectLead = previous.document.context?.assignments?.some((item) => item.memberId === request.auth.user.memberId && ["captain", "manager"].includes(item.roleId));
        const projectCreator = previous.createdBy === request.auth.user.id;
        if (!projectCreator && !projectLead && !canManageNamedTeam(data, request.auth.user, team)) throw httpError(403, "FORBIDDEN", "Only project leadership can change its team and memory.");
      }
      const record = {
        ...previous,
        document: preserveProjectProgress(previous.document, request.body),
        revision: (previous.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.user.id
      };
      data.workspace.projects[request.params.id] = record;
      data.workspace.project = record;
      return { project: record.document, revision: record.revision, updatedAt: record.updatedAt };
    });
  });

  app.delete("/api/projects/:id", {
    preHandler: [requireAuth, requireCsrf],
    schema: { tags: ["System"], summary: "Delete a project and its project-scoped artifacts", security: [{ sessionCookie: [], csrfToken: [] }], params: projectParams }
  }, async (request, reply) => {
    await store.update((data) => {
      const record = data.workspace.projects?.[request.params.id];
      if (!record) throw httpError(404, "PROJECT_NOT_FOUND", "Project was not found.");
      const context = record.document?.context;
      const team = data.teams.find((item) => item.id === context?.teamId);
      const projectLead = context?.assignments?.some((item) => item.memberId === request.auth.user.memberId && ["captain", "manager"].includes(item.roleId));
      const canDelete = request.auth.user.accessRole === "owner_admin" || record.createdBy === request.auth.user.id || projectLead || canManageNamedTeam(data, request.auth.user, team);
      if (!canDelete) throw httpError(403, "FORBIDDEN", "Only project leadership can delete this project.");

      const projectArtifactIds = new Set(context?.projectArtifactIds || []);
      data.artifacts = data.artifacts.filter((artifact) => !projectArtifactIds.has(artifact.id) && !(artifact.scope === "project" && artifact.ownerId === request.params.id));
      delete data.workspace.projects[request.params.id];
      delete data.workspace.labs?.[request.params.id];
      if (data.workspace.project?.document?.id === request.params.id) {
        data.workspace.project = Object.values(data.workspace.projects).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] || null;
      }
      return null;
    });
    reply.code(204).send();
  });

  app.get("/api/workspace/project", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "Read the shared mission project", security: [{ sessionCookie: [] }] }
  }, async () => {
    const record = store.read().workspace.project;
    return { project: record?.document ?? null, revision: record?.revision ?? 0, updatedAt: record?.updatedAt ?? null, validationResetId: store.read().workspace.validationResetId ?? null };
  });

  app.put("/api/workspace/project", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["System"],
      summary: "Persist the shared mission project",
      security: [{ sessionCookie: [], csrfToken: [] }],
      body: { type: "object", additionalProperties: true }
    }
  }, async (request) => {
    if (request.auth.user.accessRole === "advisor") throw httpError(403, "FORBIDDEN", "Advisors have read-only access to the project workspace.");
    if (!validProjectDocument(request.body)) throw httpError(400, "INVALID_PROJECT", "The project document is invalid or unsupported.");
    const currentContext = store.read().workspace.project?.document?.context;
    if (!isDeepStrictEqual(currentContext, request.body.context)) {
      requireTeamRole(request.auth.user, ["owner_admin", "captain", "manager"], ["captain", "manager"]);
    }
    return store.update((data) => {
      const previous = data.workspace.project;
      const record = {
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        createdBy: previous?.createdBy ?? request.auth.user.id,
        document: preserveProjectProgress(previous?.document, request.body),
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.user.id
      };
      data.workspace.project = record;
      data.workspace.projects[request.body.id] = record;
      return { project: record.document, revision: record.revision, updatedAt: record.updatedAt };
    });
  });

  const labParams = {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: {
        type: "string",
        minLength: 1,
        maxLength: 100,
        pattern: "^(?!__proto__$)(?!constructor$)(?!prototype$)[A-Za-z0-9._:-]+$"
      }
    }
  };

  app.get("/api/workspace/labs/:projectId", {
    preHandler: [requireAuth],
    schema: { tags: ["System"], summary: "Read a shared exploration map", security: [{ sessionCookie: [] }], params: labParams }
  }, async (request) => {
    const record = store.read().workspace.labs[request.params.projectId];
    return { board: record?.document ?? null, revision: record?.revision ?? 0, updatedAt: record?.updatedAt ?? null };
  });

  app.put("/api/workspace/labs/:projectId", {
    preHandler: [requireAuth, requireCsrf],
    schema: {
      tags: ["System"],
      summary: "Persist a shared exploration map",
      security: [{ sessionCookie: [], csrfToken: [] }],
      params: labParams,
      body: { type: "object", additionalProperties: true }
    }
  }, async (request) => {
    if (request.auth.user.accessRole === "advisor") throw httpError(403, "FORBIDDEN", "Advisors have read-only access to the project workspace.");
    if (!validLabBoard(request.body)) throw httpError(400, "INVALID_LAB_BOARD", "The exploration map is invalid or unsupported.");
    return store.update((data) => {
      const previous = data.workspace.labs[request.params.projectId];
      const record = {
        document: preserveProjectProgress(previous?.document, request.body),
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.user.id
      };
      data.workspace.labs[request.params.projectId] = record;
      return { board: record.document, revision: record.revision, updatedAt: record.updatedAt };
    });
  });

  if (options.serveStatic ?? production) {
    await app.register(fastifyStatic, { root: resolve("dist"), prefix: "/" });
  }

  app.setErrorHandler((error, request, reply) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    const validation = error.validation ? "The submitted data is incomplete or invalid." : null;
    reply.code(statusCode).send({
      error: error.validation ? "VALIDATION_ERROR" : error.code || "INTERNAL_ERROR",
      message: validation || (statusCode < 500 ? error.message : "The server could not complete this request.")
    });
  });

  app.decorate("missionStore", store);
  app.addHook("onClose", async () => store.close?.());
  return app;
}
