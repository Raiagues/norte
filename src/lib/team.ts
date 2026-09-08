import type { Language } from "./types";

export type AccessRole = "owner_admin" | "captain" | "manager" | "member" | "advisor";
export type MemberStatus = "demo" | "invited" | "active";
export type ArtifactKind = "official" | "document" | "repository" | "dataset" | "link";
export type ArtifactScope = "team" | "project";

export type SessionUser = {
  id: string;
  memberId: string;
  name: string;
  initials: string;
  email: string;
  accessRole: AccessRole;
  institution: string;
  primaryArea?: string;
  avatarUrl?: string;
  profileComplete?: boolean;
};

export type TeamMember = {
  id: string;
  accountId: string | null;
  displayName: string;
  email: string;
  missionRole: string;
  primaryArea: string;
  secondaryAreas: string[];
  institution: string;
  course: string;
  academicStage: string;
  skills: string[];
  availabilityHours: number;
  notes: string;
  accountStatus: MemberStatus;
  accessRole: AccessRole | null;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  artifactIds: string[];
  joinRequests: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  membership?: "member" | "requested" | "available";
  canManage?: boolean;
  memberCount?: number;
  artifactCount?: number;
  projectCount?: number;
};

export type ArtifactStatus = "parsed" | "pdf" | "not_parsed" | "metadata_only" | "unknown";

/** The server's verdict on whether this source can reach engineering extraction. */
export type ArtifactReadability = {
  status: ArtifactStatus;
  reason: string;
};

export type ConnectedArtifact = {
  id: string;
  kind: ArtifactKind;
  label: string;
  url: string;
  /** API path to the stored bytes, when Norte holds the file itself. */
  contentPath?: string;
  readability?: ArtifactReadability;
  description: string;
  tags: string[];
  official: boolean;
  createdBy: string | null;
  scope?: ArtifactScope;
  ownerId?: string | null;
  fileName?: string;
  mimeType?: string;
  size?: number;
  connectedAt: string;
  updatedAt: string;
};

export type DirectoryMember = {
  id: string;
  displayName: string;
  institution: string;
  course: string;
  avatarUrl?: string;
  presence: "online" | "recent" | "offline";
};

export type ProjectSummary = {
  id: string;
  name: string;
  programId: string | null;
  teamId: string | null;
  updatedAt: string;
  memberCount: number;
};

export type TeamProjectParticipant = {
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  roleId: string;
  roleName: string;
  sectorId: string;
  sectorName: string;
};

export type TeamProjectSummary = ProjectSummary & {
  participants: TeamProjectParticipant[];
};

export function memberInitials(name: string): string {
  return name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function accessRoleLabel(role: AccessRole, language: Language): string {
  const labels: Record<AccessRole, Record<Language, string>> = {
    owner_admin: { pt: "Proprietário e administrador", en: "Owner and administrator" },
    captain: { pt: "Capitão", en: "Captain" },
    manager: { pt: "Gerente", en: "Manager" },
    member: { pt: "Membro", en: "Member" },
    advisor: { pt: "Orientador", en: "Advisor" }
  };
  return labels[role][language];
}
