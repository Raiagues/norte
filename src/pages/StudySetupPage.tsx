import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Unlink2,
  UsersRound,
  X
} from "lucide-react";
import { LanguageToggle } from "../components/LanguageToggle";
import { ArtifactSourceFields } from "../components/ArtifactSourceFields";
import { UserBadge } from "../components/UserBadge";
import { ProjectTeamConfigurator } from "../components/ProjectTeamConfigurator";
import { ApiError, useAuth } from "../lib/auth";
import { artifactHref, artifactIsStoredFile, artifactStatusLabel, formatArtifactSize } from "../lib/artifacts";
import { projectMemoryReadiness } from "../../shared/project-memory.mjs";
import { programCategory, programModality, referenceProgram, REFERENCE_PROGRAMS } from "../lib/programs";
import type { MissionProject, ProjectMemberAssignment } from "../lib/projectStore";
import { memberInitials } from "../lib/team";
import type { ArtifactKind, ArtifactScope, ConnectedArtifact, TeamMember, TeamRecord } from "../lib/team";
import type { Language } from "../lib/types";
import "../project-memory.css";

type Props = {
  language: Language;
  project: MissionProject;
  isDraft?: boolean;
  t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  onProjectChange: (project: MissionProject) => void;
  onContinue: () => Promise<void> | void;
  onHome: () => void;
  onTeams: () => void;
  onManageTeam: () => void;
};

type DialogState =
  | { type: "program" }
  | { type: "team" }
  | { type: "team-artifacts" }
  | { type: "artifact"; scope: ArtifactScope; artifact: ConnectedArtifact | null }
  | null;

type ArtifactFormat = "github" | "pdf" | "csv" | "sheet" | "doc" | "code" | "link";

function artifactFormat(artifact: ConnectedArtifact): ArtifactFormat {
  if (artifact.kind === "repository" || /github\.com/iu.test(artifact.url)) return "github";
  const path = (artifact.fileName || artifact.url).toLocaleLowerCase("en-US").split(/[?#]/u)[0];
  if (path.endsWith(".pdf")) return "pdf";
  if (path.endsWith(".csv")) return "csv";
  if (/\.(xlsx?|ods)$/u.test(path)) return "sheet";
  if (/\.(docx?|odt|rtf)$/u.test(path)) return "doc";
  if (/\.(ino|c|cpp|h|ts|tsx|js|py)$/u.test(path)) return "code";
  return artifact.kind === "link" ? "link" : "doc";
}

function ArtifactIcon({ artifact }: { artifact: ConnectedArtifact }) {
  const format = artifactFormat(artifact);
  if (format === "github") return <span className="pm-format-icon github"><GitBranch aria-hidden="true" /><small>GIT</small></span>;
  if (format === "csv" || format === "sheet") return <span className="pm-format-icon sheet"><FileSpreadsheet aria-hidden="true" /><small>{format === "csv" ? "CSV" : "XLS"}</small></span>;
  if (format === "code") return <span className="pm-format-icon code"><FileCode2 aria-hidden="true" /><small>CODE</small></span>;
  if (format === "link") return <span className="pm-format-icon link"><Link2 aria-hidden="true" /></span>;
  return <span className={"pm-format-icon " + format}><FileText aria-hidden="true" /><small>{format === "pdf" ? "PDF" : "DOC"}</small></span>;
}

function MemoryDialog({ title, eyebrow, children, onClose, className = "" }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="pm-dialog-backdrop" role="presentation" onPointerDown={onClose}>
    <section className={`pm-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="pm-dialog-title" onPointerDown={(event) => event.stopPropagation()}>
      <header><div><span>{eyebrow}</span><h2 id="pm-dialog-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X aria-hidden="true" /></button></header>
      {children}
    </section>
  </div>;
}

export function StudySetupPage({ language, project, isDraft = false, t, onLanguageChange, onProjectChange, onContinue, onHome, onTeams }: Props) {
  const auth = useAuth();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [artifacts, setArtifacts] = useState<ConnectedArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [programSyncing, setProgramSyncing] = useState(false);

  const c = useMemo(() => language === "pt" ? {
    back: "Início",
    eyebrow: "MEMÓRIA DO PROJETO",
    title: "Memória do projeto",
    subtitle: "O contexto essencial da missão, sem tirar o foco do que a equipe precisa fazer.",
    projectName: "NOME DO PROJETO",
    projectPlaceholder: "Ex.: Missão Aurora",
    referenceProgram: "PROGRAMA DE REFERÊNCIA",
    programHint: "Ao selecionar um programa, as informações e os documentos oficiais são carregados automaticamente.",
    chooseProgram: "Selecione um programa",
    chooseReference: "Escolher programa",
    programDetails: "Ver detalhes",
    programEmptyTitle: "Escolha um programa de referência",
    programEmptyHint: "Documentos, categorias e prazos oficiais serão carregados automaticamente.",
    programDetailsHint: "Escolha a competição e configure apenas as informações que mudam o contexto deste projeto.",
    available: "Disponível",
    soon: "em breve",
    modality: "Modalidade",
    category: "Categoria",
    officialDocs: "Documentos oficiais",
    officialSource: "Fonte oficial OBSAT · somente leitura",
    importingProgram: "Importando regras, categoria e próximo marco da OBSAT...",
    importedProgram: "Contexto oficial da OBSAT sincronizado.",
    milestone: "Próximo marco",
    deadline: "Prazo oficial",
    team: "EQUIPE DO PROJETO",
    teamHint: "Associe uma equipe e escolha quem participará especificamente deste projeto.",
    chooseTeam: "Selecione uma equipe",
    noTeam: "Você ainda não participa de nenhuma equipe.",
    teamsArea: "Abrir equipes",
    configureTeam: "Configurar equipe",
    teamEmptyTitle: "Conecte uma equipe ao projeto",
    teamEmptyHint: "Depois, escolha os participantes e atribua suas funções.",
    participating: "Participantes",
    people: "pessoas",
    viewTeam: "Lista e hierarquia",
    chooseMembers: "Escolher membros",
    addMember: "Nova pessoa",
    projectStructure: "Cargos e setores",
    structureTitle: "Estrutura deste projeto",
    structureHint: "Cargos e setores pertencem somente a este projeto. Os dados acadêmicos continuam no perfil de cada pessoa.",
    roles: "CARGOS",
    sectors: "SETORES",
    addRole: "Adicionar cargo",
    addSector: "Adicionar setor",
    newRole: "Novo cargo",
    newSector: "Novo setor",
    roleInUse: "Este cargo está atribuído e não pode ser removido.",
    role: "Função",
    sector: "Setor",
    noSector: "Sem setor",
    teamArtifacts: "ARTEFATOS DA EQUIPE",
    teamArtifactsHint: "Referências permanentes da equipe vinculadas a esta memória. Remover aqui não apaga o arquivo da equipe.",
    projectArtifacts: "ARTEFATOS DO PROJETO",
    projectArtifactsHint: "Repositórios e documentos criados especificamente para este projeto.",
    selectArtifacts: "Selecionar",
    addArtifact: "Adicionar",
    noArtifacts: "Nenhum artefato vinculado.",
    unlink: "Remover desta memória",
    edit: "Editar",
    delete: "Excluir artefato do projeto",
    open: "Abrir",
    continue: "Começar concepção",
    createAndContinue: "Criar projeto e começar",
    ready: "A memória essencial está pronta.",
    missing: "Para continuar, complete:",
    missingName: "nome do projeto",
    missingProgram: "programa, modalidade e categoria",
    missingTeam: "equipe do projeto",
    missingMembers: "ao menos uma pessoa",
    missingReadable: "um documento de texto ou PDF que o Norte consiga ler",
    independentProgram: "Projeto de engenharia independente",
    independentHint: "Este projeto não participa de uma competição.",
    markIndependent: "Sem programa de referência",
    chooseProgramInstead: "Escolher um programa",
    loading: "Carregando memória",
    loadError: "Não foi possível carregar a memória do projeto.",
    saved: "Alteração salva.",
    unlinked: "O artefato saiu desta memória, mas continua guardado na equipe.",
    chooseProjectMembers: "Membros deste projeto",
    memberDialogHint: "Marque somente quem participa deste projeto. A equipe completa não será alterada.",
    inviteTitle: "Adicionar pessoa à equipe",
    personName: "Nome",
    personEmail: "E-mail",
    inviteHint: "A pessoa poderá criar a conta normalmente com este e-mail; não é necessário código.",
    teamLibrary: "Biblioteca da equipe",
    teamLibraryHint: "Marque quais referências desta equipe devem aparecer nesta memória.",
    teamReference: "Da equipe",
    projectReference: "Do projeto",
    newProjectArtifact: "Novo artefato do projeto",
    editArtifact: "Editar artefato",
    kind: "Tipo",
    artifactName: "Nome",
    url: "Link ou caminho",
    description: "Descrição",
    save: "Salvar",
    remove: "Remover",
    cancel: "Cancelar",
    deleteConfirm: "Excluir este artefato do projeto? Esta ação remove a referência do acervo do projeto.",
    sourceKinds: { document: "Documento", repository: "Repositório GitHub", dataset: "CSV ou planilha", link: "Link" }
  } : {
    back: "Home",
    eyebrow: "PROJECT MEMORY",
    title: "Project memory",
    subtitle: "The mission's essential context, without distracting the team from the work ahead.",
    projectName: "PROJECT NAME",
    projectPlaceholder: "E.g. Aurora Mission",
    referenceProgram: "REFERENCE PROGRAM",
    programHint: "Selecting a program automatically loads its official information and documents.",
    chooseProgram: "Select a program",
    chooseReference: "Choose program",
    programDetails: "View details",
    programEmptyTitle: "Choose a reference program",
    programEmptyHint: "Official documents, categories, and deadlines will load automatically.",
    programDetailsHint: "Choose the competition and configure only the information that changes this project's context.",
    available: "Available",
    soon: "coming soon",
    modality: "Modality",
    category: "Category",
    officialDocs: "Official documents",
    officialSource: "Official OBSAT source · read only",
    importingProgram: "Importing OBSAT rules, category, and next milestone...",
    importedProgram: "Official OBSAT context synchronized.",
    milestone: "Next milestone",
    deadline: "Official deadline",
    team: "PROJECT TEAM",
    teamHint: "Associate a team and choose who will take part in this specific project.",
    chooseTeam: "Select a team",
    noTeam: "You are not part of a team yet.",
    teamsArea: "Open teams",
    configureTeam: "Configure team",
    teamEmptyTitle: "Connect a team to the project",
    teamEmptyHint: "Then choose participants and assign their roles.",
    participating: "Participants",
    people: "people",
    viewTeam: "List and hierarchy",
    chooseMembers: "Choose members",
    addMember: "New person",
    projectStructure: "Roles and sectors",
    structureTitle: "Project structure",
    structureHint: "Roles and sectors belong only to this project. Academic information remains in each person's profile.",
    roles: "ROLES",
    sectors: "SECTORS",
    addRole: "Add role",
    addSector: "Add sector",
    newRole: "New role",
    newSector: "New sector",
    roleInUse: "This role is assigned and cannot be removed.",
    role: "Role",
    sector: "Sector",
    noSector: "No sector",
    teamArtifacts: "TEAM ARTIFACTS",
    teamArtifactsHint: "Long-lived team references linked to this memory. Removing one here does not delete it from the team.",
    projectArtifacts: "PROJECT ARTIFACTS",
    projectArtifactsHint: "Repositories and documents created specifically for this project.",
    selectArtifacts: "Select",
    addArtifact: "Add",
    noArtifacts: "No artifacts linked.",
    unlink: "Remove from this memory",
    edit: "Edit",
    delete: "Delete project artifact",
    open: "Open",
    continue: "Start conception",
    createAndContinue: "Create project and start",
    ready: "Essential memory is ready.",
    missing: "To continue, complete:",
    missingName: "project name",
    missingProgram: "program, modality, and category",
    missingTeam: "project team",
    missingMembers: "at least one person",
    missingReadable: "a text or PDF document Norte can read",
    independentProgram: "Independent engineering project",
    independentHint: "This project is not part of a competition.",
    markIndependent: "No reference program",
    chooseProgramInstead: "Choose a program",
    loading: "Loading memory",
    loadError: "Project memory could not be loaded.",
    saved: "Change saved.",
    unlinked: "The artifact was removed from this memory but remains in the team library.",
    chooseProjectMembers: "Project members",
    memberDialogHint: "Select only those participating in this project. The full team will not be changed.",
    inviteTitle: "Add a person to the team",
    personName: "Name",
    personEmail: "Email",
    inviteHint: "The person can create an account normally with this email; no code is needed.",
    teamLibrary: "Team library",
    teamLibraryHint: "Select which team references should appear in this memory.",
    teamReference: "From team",
    projectReference: "From project",
    newProjectArtifact: "New project artifact",
    editArtifact: "Edit artifact",
    kind: "Type",
    artifactName: "Name",
    url: "Link or path",
    description: "Description",
    save: "Save",
    remove: "Remove",
    cancel: "Cancel",
    deleteConfirm: "Delete this project artifact? This removes the reference from the project library.",
    sourceKinds: { document: "Document", repository: "GitHub repository", dataset: "CSV or spreadsheet", link: "Link" }
  }, [language]);

  const loadMemory = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, memberResponse, artifactResponse] = await Promise.all([
        auth.api<{ teams: TeamRecord[] }>("/teams"),
        auth.api<{ members: TeamMember[] }>("/team/members"),
        auth.api<{ artifacts: ConnectedArtifact[] }>("/artifacts")
      ]);
      setTeams(teamResponse.teams);
      setMembers(memberResponse.members);
      setArtifacts(artifactResponse.artifacts.filter((artifact) => !artifact.official));
    } catch (reason) {
      setFeedback(reason instanceof ApiError ? reason.message : c.loadError);
    } finally {
      setLoading(false);
    }
  }, [auth.api, c.loadError]);

  useEffect(() => { void loadMemory(); }, [loadMemory]);

  const program = referenceProgram(project.context.programId);
  const independent = !program && project.context.referenceProgram === "independent";
  const modality = programModality(program, project.context.modalityId);
  const category = programCategory(modality, project.context.categoryId);
  const associatedTeams = teams.filter((team) => team.membership === "member" || team.memberIds.includes(auth.user?.memberId || ""));
  const selectedTeam = associatedTeams.find((team) => team.id === project.context.teamId) ?? null;
  const selectedProjectMembers = useMemo(() => project.context.assignments.map((assignment) => {
    const member = members.find((item) => item.id === assignment.memberId);
    return member ? { member, assignment } : null;
  }).filter((value): value is { member: TeamMember; assignment: ProjectMemberAssignment } => Boolean(value)), [members, project.context.assignments]);
  const availableTeamArtifacts = useMemo(() => selectedTeam ? selectedTeam.artifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)).filter((artifact): artifact is ConnectedArtifact => Boolean(artifact)) : [], [artifacts, selectedTeam]);
  const linkedTeamArtifacts = availableTeamArtifacts.filter((artifact) => project.context.teamArtifactIds.includes(artifact.id));
  const linkedProjectArtifacts = artifacts.filter((artifact) => artifact.scope === "project" && (artifact.ownerId === project.id || project.context.projectArtifactIds.includes(artifact.id)));

  function updateProject(next: Partial<MissionProject>, contextPatch?: Partial<MissionProject["context"]>) {
    onProjectChange({
      ...project,
      ...next,
      context: contextPatch ? { ...project.context, ...contextPatch } : project.context
    });
  }

  function selectProgram(programId: string) {
    const nextProgram = referenceProgram(programId);
    const nextModality = nextProgram?.modalities[0] ?? null;
    const nextCategory = nextModality?.categories.find((item) => item.id === "n3") ?? nextModality?.categories[0] ?? null;
    updateProject({}, {
      configured: false,
      referenceProgram: null,
      programId: nextProgram?.id ?? null,
      modalityId: nextModality?.id ?? null,
      categoryId: nextCategory?.id ?? null
    });
  }

  function selectIndependent() {
    updateProject({}, { configured: false, referenceProgram: "independent", programId: null, modalityId: null, categoryId: null });
  }

  function selectModality(modalityId: string) {
    const nextModality = program?.modalities.find((item) => item.id === modalityId) ?? null;
    updateProject({}, { configured: false, modalityId: nextModality?.id ?? null, categoryId: nextModality?.categories[0]?.id ?? null });
  }

  function selectTeam(teamId: string) {
    const team = associatedTeams.find((item) => item.id === teamId) ?? null;
    if (!team) {
      updateProject({}, { configured: false, teamId: null, teamName: "", teamArtifactIds: [], assignments: [] });
      return;
    }
    let assignments = project.context.assignments.filter((assignment) => team.memberIds.includes(assignment.memberId));
    if (assignments.length === 0) {
      const preferredMemberId = team.memberIds.includes(auth.user?.memberId || "") ? auth.user?.memberId : team.memberIds[0];
      if (preferredMemberId) assignments = [{ memberId: preferredMemberId, roleId: "captain", sectorId: "" }];
    }
    updateProject({}, { configured: false, teamId: team.id, teamName: team.name, teamArtifactIds: [...team.artifactIds], assignments });
  }

  function toggleTeamArtifact(artifactId: string) {
    const linked = project.context.teamArtifactIds.includes(artifactId);
    updateProject({}, { teamArtifactIds: linked ? project.context.teamArtifactIds.filter((id) => id !== artifactId) : [...project.context.teamArtifactIds, artifactId] });
    if (linked) setFeedback(c.unlinked);
  }

  async function createMember(name: string, email: string): Promise<TeamMember> {
    if (!selectedTeam) throw new Error(c.noTeam);
    setBusy(true);
    setFeedback("");
    try {
      const response = await auth.api<{ member: TeamMember }>("/team/members", {
        method: "POST",
        body: JSON.stringify({
          teamId: selectedTeam.id,
          displayName: name,
          email,
          missionRole: "member",
          primaryArea: "systems",
          secondaryAreas: [],
          institution: "",
          course: "",
          academicStage: "",
          skills: [],
          availabilityHours: 0,
          notes: ""
        })
      });
      await loadMemory();
      setFeedback(c.saved);
      return response.member;
    } catch (reason) {
      setFeedback(reason instanceof ApiError ? reason.message : c.loadError);
    } finally {
      setBusy(false);
    }
    throw new Error(c.loadError);
  }

  async function renameMember(memberId: string, name: string) {
    await auth.api(`/team/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ displayName: name }) });
    await loadMemory();
  }

  function finishProgramSetup() {
    setDialog(null);
    setProgramSyncing(true);
    window.setTimeout(() => {
      setProgramSyncing(false);
      setFeedback(c.importedProgram);
    }, 1100);
  }

  async function saveArtifact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.type !== "artifact") return;
    const data = new FormData(event.currentTarget);
    const current = dialog.artifact;
    const ownerId = dialog.scope === "team" ? selectedTeam?.id : project.id;
    if (!ownerId) return;
    const payload: Record<string, unknown> = {
      kind: String(data.get("kind") || "document") as ArtifactKind,
      label: String(data.get("label") || ""),
      url: String(data.get("url") || ""),
      fileName: String(data.get("fileName") || ""),
      mimeType: String(data.get("mimeType") || ""),
      size: Number(data.get("size") || 0),
      description: String(data.get("description") || ""),
      tags: [],
      scope: dialog.scope,
      ownerId
    };
    // Editing a stored file without replacing it submits no url: the server
    // keeps the bytes it already holds. A new artifact always needs a source.
    const keepsStoredContent = Boolean(current && !payload.url && current.contentPath);
    if (keepsStoredContent) Reflect.deleteProperty(payload, "url");
    else if (!payload.url) {
      setFeedback(language === "pt" ? "Adicione um link ou escolha um arquivo." : "Add a link or choose a file.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      let artifactId = current?.id || "";
      if (current) {
        await auth.api("/artifacts/" + current.id, { method: "PATCH", body: JSON.stringify(payload) });
        updateProject({ memoryRevision: project.memoryRevision + 1 });
      } else {
        const response = await auth.api<{ artifact: ConnectedArtifact }>("/artifacts", { method: "POST", body: JSON.stringify(payload) });
        artifactId = response.artifact.id;
      }
      if (dialog.scope === "project" && artifactId && !project.context.projectArtifactIds.includes(artifactId)) {
        updateProject({}, { projectArtifactIds: [...project.context.projectArtifactIds, artifactId] });
      }
      if (dialog.scope === "team" && artifactId && !project.context.teamArtifactIds.includes(artifactId)) {
        updateProject({}, { teamArtifactIds: [...project.context.teamArtifactIds, artifactId] });
      }
      setDialog(null);
      await loadMemory();
      setFeedback(c.saved);
    } catch (reason) {
      setFeedback(reason instanceof ApiError ? reason.message : c.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProjectArtifact(artifact: ConnectedArtifact) {
    if (!window.confirm(c.deleteConfirm)) return;
    setBusy(true);
    try {
      await auth.api("/artifacts/" + artifact.id, { method: "DELETE" });
      updateProject({}, { projectArtifactIds: project.context.projectArtifactIds.filter((id) => id !== artifact.id) });
      await loadMemory();
    } catch (reason) {
      setFeedback(reason instanceof ApiError ? reason.message : c.loadError);
    } finally {
      setBusy(false);
    }
  }

  // One readiness rule, shared with the server, so the page can never promise
  // memory that /system-ai/generate will immediately reject.
  const readiness = projectMemoryReadiness(project, artifacts);
  const missingLabels: Record<string, string> = { name: c.missingName, team: c.missingTeam, "readable-artifact": c.missingReadable };
  const missing = (loading ? [] : readiness.missing).map((code) => missingLabels[code]).filter(Boolean);
  const canContinue = !loading && readiness.ready;

  async function continueToConception() {
    if (!canContinue) return;
    updateProject({}, { configured: true });
    setBusy(true);
    setFeedback("");
    try {
      await onContinue();
    } catch (reason) {
      setFeedback(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : c.loadError);
    } finally {
      setBusy(false);
    }
  }

  function ArtifactCard({ artifact, scope }: { artifact: ConnectedArtifact; scope: ArtifactScope }) {
    const canEdit = scope === "project" || Boolean(selectedTeam?.canManage);
    const stored = artifactIsStoredFile(artifact);
    const href = artifactHref(artifact);
    const status = artifactStatusLabel(artifact, language);
    const size = formatArtifactSize(artifact.size);
    return <article className="pm-artifact-card">
      <a href={href} target={stored ? undefined : "_blank"} rel={stored ? undefined : "noreferrer"} download={stored ? artifact.fileName || artifact.label : undefined} aria-label={`${c.open}: ${artifact.label}`}>
        <ArtifactIcon artifact={artifact} />
        <div>
          <small>{scope === "team" ? c.teamReference : c.projectReference}</small>
          <strong>{artifact.label}</strong>
          <span>{artifact.description || artifact.url}</span>
          <em className={status.usable ? "pm-artifact-status usable" : "pm-artifact-status blocked"}>{size && `${size} · `}{status.text}</em>
        </div>
        <ExternalLink aria-hidden="true" />
      </a>
      <div className="pm-artifact-actions">
        {canEdit && <button type="button" title={c.edit} aria-label={c.edit} onClick={() => setDialog({ type: "artifact", scope, artifact })}><Pencil aria-hidden="true" /></button>}
        {scope === "team" ? <button type="button" title={c.unlink} aria-label={c.unlink} onClick={() => toggleTeamArtifact(artifact.id)}><Unlink2 aria-hidden="true" /></button> : <button type="button" title={c.delete} aria-label={c.delete} onClick={() => void deleteProjectArtifact(artifact)}><Trash2 aria-hidden="true" /></button>}
      </div>
    </article>;
  }

  return <div className="pm-shell">
    <main className="pm-main">
      <header className="pm-topbar">
        <button type="button" onClick={onHome}><ArrowLeft aria-hidden="true" />{c.back}</button>
        <div className="top-actions"><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge connectedLabel={t("common.connected")} /></div>
      </header>

      <div className="pm-workspace">
        <header className="pm-heading">
          <div><span>{c.eyebrow}</span><h1>{c.title}</h1><p>{c.subtitle}</p></div>
          <label className="pm-project-name"><span>{c.projectName}</span><div><Pencil aria-hidden="true" /><input value={project.name} onChange={(event) => updateProject({ name: event.target.value })} placeholder={c.projectPlaceholder} maxLength={120} /></div></label>
        </header>

        {feedback && <div className="pm-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback("")} aria-label="Fechar"><X aria-hidden="true" /></button></div>}

        <section className={program ? "pm-program-card" : "pm-program-card empty"}>
          <span className="pm-card-label">{c.referenceProgram}</span>
          {/* A real mission need not belong to a competition: "independent" is a
              legitimate, deliberate state, not an unfinished one. */}
          {!program && <button className="pm-empty-program" type="button" onClick={() => setDialog({ type: "program" })}>
            <span><BookOpenCheck aria-hidden="true" /></span>
            <div>
              <strong>{independent ? c.independentProgram : c.programEmptyTitle}</strong>
              <small>{independent ? c.independentHint : c.programEmptyHint}</small>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>}
          {program && <>
            <div className="pm-program-logo">{program.logoSrc ? <img src={program.logoSrc} alt={program.shortName} /> : <BookOpenCheck aria-hidden="true" />}</div>
            <div className="pm-program-copy"><strong>{program.name[language]}</strong><span>{modality?.label[language]}</span></div>
            <div className="pm-program-meta">
              <span><CalendarDays aria-hidden="true" /><small>{c.deadline}</small><strong>{modality?.milestone.date || "—"}</strong></span>
              <span><BookOpenCheck aria-hidden="true" /><small>{c.category}</small><strong>{category?.label[language] || "—"}</strong></span>
            </div>
            <button className="pm-details-button" type="button" onClick={() => setDialog({ type: "program" })}>{c.programDetails}<ChevronRight aria-hidden="true" /></button>
          </>}
        </section>
        {programSyncing && <div className="pm-program-import" role="status"><span><LoaderCircle className="pm-spin" aria-hidden="true" /></span><div><strong>{c.importingProgram}</strong><i /></div></div>}

        <section className="pm-band pm-team-band">
          <header><div><h2>{c.team}</h2><p>{c.teamHint}</p></div><div className="pm-band-actions"><button type="button" onClick={() => setDialog({ type: "team" })}><Settings2 aria-hidden="true" />{c.configureTeam}</button></div></header>
          <div className="pm-horizontal-track">
            {loading && <div className="pm-loading"><LoaderCircle aria-hidden="true" />{c.loading}</div>}
            {!loading && !selectedTeam && <button className="pm-track-empty" type="button" onClick={() => setDialog({ type: "team" })}><UsersRound aria-hidden="true" /><span><strong>{c.teamEmptyTitle}</strong><small>{c.teamEmptyHint}</small></span><ChevronRight aria-hidden="true" /></button>}
            {!loading && selectedTeam && <button className="pm-team-summary" type="button" onClick={() => setDialog({ type: "team" })}><UsersRound aria-hidden="true" /><span><small>{c.team}</small><strong>{selectedTeam.name}</strong><em>{selectedProjectMembers.length} {selectedProjectMembers.length === 1 ? (language === "pt" ? "pessoa" : "person") : c.people}</em></span><ChevronRight aria-hidden="true" /></button>}
            {!loading && selectedProjectMembers.map(({ member, assignment }) => {
              const role = project.context.roles.find((item) => item.id === assignment.roleId)?.name || assignment.roleId;
              const sector = project.context.sectors.find((item) => item.id === assignment.sectorId)?.name || "";
              return <button className="pm-member-card" type="button" key={member.id} onClick={() => setDialog({ type: "team" })}>
                <span className={member.avatarUrl ? "pm-member-avatar has-photo" : "pm-member-avatar"}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : memberInitials(member.displayName)}</span>
                <span><strong>{member.displayName}</strong><small>{[role, sector].filter(Boolean).join(" · ")}</small><em>{member.course || member.institution || member.email}</em></span>
                <Pencil aria-hidden="true" />
              </button>;
            })}
          </div>
        </section>

        <section className="pm-artifacts-board">
          <section className="pm-band pm-artifact-band">
            <header><div><h2>{c.teamArtifacts}</h2><p>{c.teamArtifactsHint}</p></div><button type="button" onClick={() => setDialog({ type: "team-artifacts" })} disabled={!selectedTeam}><Plus aria-hidden="true" />{c.selectArtifacts}</button></header>
            <div className="pm-horizontal-track">{linkedTeamArtifacts.map((artifact) => <ArtifactCard artifact={artifact} scope="team" key={artifact.id} />)}{linkedTeamArtifacts.length === 0 && <button className="pm-track-empty compact" type="button" onClick={() => selectedTeam && setDialog({ type: "team-artifacts" })} disabled={!selectedTeam}><Link2 aria-hidden="true" /><span><strong>{c.noArtifacts}</strong></span></button>}</div>
          </section>
          <section className="pm-band pm-artifact-band">
            <header><div><h2>{c.projectArtifacts}</h2><p>{c.projectArtifactsHint}</p></div><button type="button" onClick={() => setDialog({ type: "artifact", scope: "project", artifact: null })}><Plus aria-hidden="true" />{c.addArtifact}</button></header>
            <div className="pm-horizontal-track">{linkedProjectArtifacts.map((artifact) => <ArtifactCard artifact={artifact} scope="project" key={artifact.id} />)}{linkedProjectArtifacts.length === 0 && <button className="pm-track-empty compact" type="button" onClick={() => setDialog({ type: "artifact", scope: "project", artifact: null })}><FileText aria-hidden="true" /><span><strong>{c.noArtifacts}</strong></span></button>}</div>
          </section>
        </section>

        <footer className="pm-footer">
          <div className={missing.length ? "pm-readiness missing" : "pm-readiness"}>{missing.length ? <><span>{c.missing}</span><strong>{missing.join(" · ")}</strong></> : <><Check aria-hidden="true" /><strong>{c.ready}</strong></>}</div>
          <button type="button" onClick={() => void continueToConception()} disabled={!canContinue || busy}>{loading || busy ? <LoaderCircle className="pm-spin" aria-hidden="true" /> : null}{isDraft ? c.createAndContinue : c.continue}<ArrowRight aria-hidden="true" /></button>
        </footer>
      </div>
    </main>

    {dialog?.type === "program" && <MemoryDialog eyebrow={c.referenceProgram} title={program ? c.programDetails : c.chooseReference} onClose={() => setDialog(null)}>
      <div className="pm-dialog-copy">{c.programDetailsHint}</div>
      <div className="pm-program-picker" role="radiogroup" aria-label={c.referenceProgram}>
        <button className={independent ? "selected" : ""} type="button" role="radio" aria-checked={independent} onClick={() => selectIndependent()}>
          <span className="pm-program-option-logo"><BookOpenCheck aria-hidden="true" /></span>
          <span><strong>{c.markIndependent}</strong><small>{c.independentHint}</small></span>
          <em>{c.available}</em>
          {independent && <Check aria-hidden="true" />}
        </button>
        {REFERENCE_PROGRAMS.map((item) => <button className={item.id === program?.id ? "selected" : ""} type="button" role="radio" aria-checked={item.id === program?.id} disabled={!item.available} onClick={() => selectProgram(item.id)} key={item.id}>
          <span className="pm-program-option-logo">{item.logoSrc ? <img src={item.logoSrc} alt="" /> : <BookOpenCheck aria-hidden="true" />}</span>
          <span><strong>{item.shortName}</strong><small>{item.name[language]}</small></span>
          <em>{item.available ? c.available : c.soon}</em>
          {item.id === program?.id && <Check aria-hidden="true" />}
        </button>)}
      </div>
      {program && <div className="pm-program-detail">
        <div className="pm-program-detail-heading"><div className="pm-program-logo">{program.logoSrc ? <img src={program.logoSrc} alt={program.shortName} /> : <BookOpenCheck aria-hidden="true" />}</div><div><strong>{program.name[language]}</strong><p>{program.description[language]}</p></div></div>
        <div className="pm-program-controls"><label><span>{c.modality}</span><select value={project.context.modalityId || ""} onChange={(event) => selectModality(event.target.value)}>{program.modalities.map((item) => <option value={item.id} key={item.id}>{item.label[language]}</option>)}</select></label><label><span>{c.category}</span><select value={project.context.categoryId || ""} disabled={!modality} onChange={(event) => updateProject({}, { configured: false, categoryId: event.target.value })}>{modality?.categories.map((item) => <option value={item.id} key={item.id}>{item.label[language]}</option>)}</select></label></div>
        {modality && <div className="pm-official-library"><h3>{c.officialDocs}<span>{c.officialSource}</span></h3><div>{modality.officialDocuments.map((document) => <a href={document.url} target="_blank" rel="noreferrer" key={document.id}><BookOpenCheck aria-hidden="true" /><span><small>{document.format.toUpperCase()}</small><strong>{document.label[language]}</strong></span><ExternalLink aria-hidden="true" /></a>)}<a href={modality.milestone.url} target="_blank" rel="noreferrer"><CalendarDays aria-hidden="true" /><span><small>{c.milestone}</small><strong>{modality.milestone.date} · {modality.milestone.label[language]}</strong></span><ExternalLink aria-hidden="true" /></a></div></div>}
      </div>}
      <footer><button className="primary" type="button" onClick={finishProgramSetup}><Check aria-hidden="true" />{c.save}</button></footer>
    </MemoryDialog>}

    {dialog?.type === "team" && <MemoryDialog className="pm-team-config-dialog" eyebrow={c.team} title={c.configureTeam} onClose={() => setDialog(null)}>
      <div className="pm-team-config">
        <label className="pm-dialog-field"><span>{c.team}</span><select value={project.context.teamId || ""} onChange={(event) => selectTeam(event.target.value)}><option value="">{associatedTeams.length ? c.chooseTeam : c.noTeam}</option>{associatedTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        {!selectedTeam && <button className="pm-dialog-empty" type="button" onClick={() => { setDialog(null); onTeams(); }}><UsersRound aria-hidden="true" /><span><strong>{c.noTeam}</strong><small>{c.teamsArea}</small></span></button>}
        {selectedTeam && <ProjectTeamConfigurator key={selectedTeam.id} language={language} context={project.context} team={selectedTeam} members={members} onCreateMember={createMember} onRenameMember={renameMember} onClose={() => setDialog(null)} onSave={(patch) => { updateProject({}, { ...patch, configured: false }); setDialog(null); setFeedback(c.saved); }} />}
      </div>
    </MemoryDialog>}

    {dialog?.type === "team-artifacts" && <MemoryDialog eyebrow={c.teamArtifacts} title={c.teamLibrary} onClose={() => setDialog(null)}><div className="pm-dialog-copy">{c.teamLibraryHint}</div><div className="pm-selection-list artifacts">{availableTeamArtifacts.map((artifact) => { const checked = project.context.teamArtifactIds.includes(artifact.id); return <label key={artifact.id}><input type="checkbox" checked={checked} onChange={() => toggleTeamArtifact(artifact.id)} /><ArtifactIcon artifact={artifact} /><span><strong>{artifact.label}</strong><small>{artifact.description || artifact.url}</small></span><Check aria-hidden="true" /></label>; })}{availableTeamArtifacts.length === 0 && <div className="pm-artifact-empty">{c.noArtifacts}</div>}</div><footer><button type="button" onClick={() => setDialog({ type: "artifact", scope: "team", artifact: null })}><Plus aria-hidden="true" />{c.addArtifact}</button><button className="primary" type="button" onClick={() => setDialog(null)}><Check aria-hidden="true" />{c.save}</button></footer></MemoryDialog>}

    {dialog?.type === "artifact" && <MemoryDialog eyebrow={dialog.scope === "team" ? c.teamArtifacts : c.projectArtifacts} title={dialog.artifact ? c.editArtifact : c.newProjectArtifact} onClose={() => setDialog(null)}><form className="pm-dialog-form" onSubmit={(event) => void saveArtifact(event)}><label><span>{c.kind}</span><select name="kind" defaultValue={dialog.artifact?.kind || "document"}><option value="document">{c.sourceKinds.document}</option><option value="repository">{c.sourceKinds.repository}</option><option value="dataset">{c.sourceKinds.dataset}</option><option value="link">{c.sourceKinds.link}</option></select></label><label><span>{c.artifactName}</span><input name="label" defaultValue={dialog.artifact?.label || ""} required maxLength={140} autoFocus /></label><ArtifactSourceFields language={language} artifact={dialog.artifact} onError={setFeedback} /><label><span>{c.description}</span><textarea name="description" defaultValue={dialog.artifact?.description || ""} maxLength={500} rows={3} /></label><footer><button type="button" onClick={() => setDialog(null)}>{c.cancel}</button><button className="primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="pm-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{c.save}</button></footer></form></MemoryDialog>}
  </div>;
}
