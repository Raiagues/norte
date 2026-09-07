import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  FilePlus2,
  FolderGit2,
  Globe2,
  List,
  LoaderCircle,
  Mail,
  Network,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Trophy,
  UsersRound,
  X
} from "lucide-react";
import { ArtifactSourceFields } from "../components/ArtifactSourceFields";
import { LanguageToggle } from "../components/LanguageToggle";
import { UserBadge } from "../components/UserBadge";
import { ApiError, useAuth } from "../lib/auth";
import { memberInitials } from "../lib/team";
import type { ArtifactKind, ConnectedArtifact, TeamMember, TeamProjectSummary, TeamRecord } from "../lib/team";
import type { Language } from "../lib/types";
import "../teams-hub.css";

type Props = {
  language: Language;
  t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  onBack: () => void;
  initialTeamId?: string;
  onTeamsChanged?: () => void;
};

type Dialog = "edit-team" | "member" | "artifact" | null;
type View = "mine" | "community";

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError || reason instanceof Error) return reason.message;
  return fallback;
}

export function TeamsHubPage({ language, t, onLanguageChange, onBack, initialTeamId = "", onTeamsChanged }: Props) {
  const auth = useAuth();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [artifacts, setArtifacts] = useState<ConnectedArtifact[]>([]);
  const [projects, setProjects] = useState<TeamProjectSummary[]>([]);
  const [projectView, setProjectView] = useState<"list" | "hierarchy">("list");
  const [selectedId, setSelectedId] = useState(initialTeamId);
  const [view, setView] = useState<View>("mine");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    document.body.classList.add("teams-window-scroll");
    return () => document.body.classList.remove("teams-window-scroll");
  }, []);

  const c = language === "pt" ? {
    eyebrow: "COLABORAÇÃO",
    title: "Equipes",
    subtitle: "Pessoas e referências que sustentam seus projetos.",
    back: "Voltar ao início",
    create: "Criar equipe",
    mine: "Minhas equipes",
    community: "Comunidade",
    empty: "Nada por aqui ainda.",
    members: "MEMBROS",
    artifacts: "BIBLIOTECA DA EQUIPE",
    addMember: "Adicionar pessoa",
    addArtifact: "Adicionar documento",
    request: "Solicitar entrada",
    requested: "Solicitação enviada",
    member: "pessoa",
    memberCount: "pessoas",
    artifactCount: "referências",
    newTeam: "Nova equipe",
    editTeam: "Editar equipe",
    teamName: "Nome da equipe",
    description: "Descrição pública",
    personName: "Nome da pessoa",
    personEmail: "E-mail",
    inviteHint: "O convite será associado a este e-mail. Os dados acadêmicos continuam no perfil da pessoa.",
    artifactName: "Nome do documento",
    artifactType: "Tipo",
    save: "Salvar",
    cancel: "Cancelar",
    created: "Equipe criada.",
    updated: "Equipe atualizada.",
    invited: "Pessoa adicionada à equipe.",
    sourceAdded: "Documento adicionado à biblioteca.",
    sourceDeleted: "Documento removido da biblioteca.",
    loadError: "Não foi possível carregar as equipes.",
    joinRequests: "SOLICITAÇÕES DE ENTRADA",
    approve: "Aprovar",
    deleteTeam: "Excluir equipe",
    deleteTeamConfirm: "Excluir esta equipe? Esta ação só será permitida se nenhum projeto estiver conectado a ela.",
    deleteArtifact: "Excluir documento",
    deleteArtifactConfirm: "Excluir este documento da biblioteca da equipe?",
    publicLabel: "PERFIL PÚBLICO",
    publicHint: "Conteúdo interno, participantes e arquivos permanecem privados até você entrar na equipe.",
    createdAt: "Criada em",
    privateContent: "Conteúdo protegido",
    privateDescription: "Somente integrantes veem pessoas, convites, funções e documentos internos.",
    searchPeople: "Buscar pessoa ou universidade",
    online: "Disponível agora",
    recent: "Ativo recentemente",
    offline: "Offline",
    activeCommunity: "equipes na comunidade",
    projects: "PROJETOS DA EQUIPE",
    projectCount: "projetos",
    noProjects: "Nenhum projeto associado a esta equipe.",
    list: "Lista",
    hierarchy: "Organograma",
    obsatCommunity: "COMUNIDADE",
    obsatHint: "Equipes participantes da Olimpíada Brasileira de Satélites. Projetos e documentos internos continuam privados."
  } : {
    eyebrow: "COLLABORATION",
    title: "Teams",
    subtitle: "The people and references behind your engineering projects.",
    back: "Back home",
    create: "Create team",
    mine: "My teams",
    community: "Community",
    empty: "Nothing here yet.",
    members: "MEMBERS",
    artifacts: "TEAM LIBRARY",
    addMember: "Add person",
    addArtifact: "Add document",
    request: "Request to join",
    requested: "Request sent",
    member: "person",
    memberCount: "people",
    artifactCount: "references",
    newTeam: "New team",
    editTeam: "Edit team",
    teamName: "Team name",
    description: "Public description",
    personName: "Person name",
    personEmail: "Email",
    inviteHint: "The invitation will be linked to this email. Academic details remain in the person's profile.",
    artifactName: "Document name",
    artifactType: "Type",
    save: "Save",
    cancel: "Cancel",
    created: "Team created.",
    updated: "Team updated.",
    invited: "Person added to the team.",
    sourceAdded: "Document added to the library.",
    sourceDeleted: "Document removed from the library.",
    loadError: "Teams could not be loaded.",
    joinRequests: "JOIN REQUESTS",
    approve: "Approve",
    deleteTeam: "Delete team",
    deleteTeamConfirm: "Delete this team? This is allowed only when no project is connected to it.",
    deleteArtifact: "Delete document",
    deleteArtifactConfirm: "Delete this document from the team library?",
    publicLabel: "PUBLIC PROFILE",
    publicHint: "Internal content, participants, and files stay private until you join the team.",
    createdAt: "Created",
    privateContent: "Protected content",
    privateDescription: "Only members can see people, invitations, roles, and internal documents.",
    searchPeople: "Search person or university",
    online: "Available now",
    recent: "Recently active",
    offline: "Offline",
    activeCommunity: "teams in the community",
    projects: "TEAM PROJECTS",
    projectCount: "projects",
    noProjects: "No projects are associated with this team.",
    list: "List",
    hierarchy: "Org chart",
    obsatCommunity: "COMMUNITY",
    obsatHint: "Teams participating in the Brazilian Satellite Olympiad. Internal projects and documents remain private."
  };

  const load = useCallback(async () => {
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
      setSelectedId((current) => {
        const relevant = teamResponse.teams.filter((team) => view === "community" ? team.membership !== "member" : team.membership === "member");
        return relevant.some((team) => team.id === current) ? current : relevant.find((team) => team.id === initialTeamId)?.id || relevant[0]?.id || "";
      });
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setLoading(false);
    }
  }, [auth.api, c.loadError, initialTeamId, view]);

  useEffect(() => { void load(); }, [load]);

  const selected = teams.find((team) => team.id === selectedId) ?? null;
  const myTeams = teams.filter((team) => team.membership === "member");
  const otherTeams = teams.filter((team) => team.membership !== "member");
  const selectedMembers = useMemo(() => selected && selected.membership === "member" ? selected.memberIds.map((id) => members.find((member) => member.id === id)).filter((member): member is TeamMember => Boolean(member)) : [], [members, selected]);
  const selectedArtifacts = useMemo(() => selected && selected.membership === "member" ? selected.artifactIds.map((id) => artifacts.find((artifact) => artifact.id === id)).filter((artifact): artifact is ConnectedArtifact => Boolean(artifact)) : [], [artifacts, selected]);
  const joinRequests = useMemo(() => selected?.canManage ? selected.joinRequests.map((id) => members.find((member) => member.id === id)).filter((member): member is TeamMember => Boolean(member)) : [], [members, selected]);

  useEffect(() => {
    if (!selected || selected.membership !== "member") {
      setProjects([]);
      return;
    }
    let active = true;
    void auth.api<{ projects: TeamProjectSummary[] }>(`/teams/${selected.id}/projects`).then((response) => {
      if (active) setProjects(response.projects);
    }).catch((reason) => {
      if (active) setFeedback(errorMessage(reason, c.loadError));
    });
    return () => { active = false; };
  }, [auth.api, c.loadError, selected]);

  function chooseView(next: View) {
    setView(next);
    const list = next === "mine" ? myTeams : otherTeams;
    const nextId = list.find((team) => team.id === (next === "mine" ? initialTeamId : selectedId))?.id || list[0]?.id || "";
    setSelectedId(nextId);
  }

  function selectTeam(team: TeamRecord) {
    setSelectedId(team.id);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback("");
    try {
      if (dialog === "edit-team" && selected) {
        await auth.api(`/teams/${selected.id}`, { method: "PATCH", body: JSON.stringify({ name: String(data.get("name") || ""), description: String(data.get("description") || "") }) });
        setFeedback(c.updated);
      } else if (dialog === "member" && selected) {
        await auth.api("/team/members", { method: "POST", body: JSON.stringify({ teamId: selected.id, displayName: String(data.get("name") || ""), email: String(data.get("email") || ""), missionRole: "member", primaryArea: "systems", secondaryAreas: [], institution: "", course: "", academicStage: "", skills: [], availabilityHours: 0, notes: "" }) });
        setFeedback(c.invited);
      } else if (dialog === "artifact" && selected) {
        const url = String(data.get("url") || "");
        if (!url) throw new Error(language === "pt" ? "Adicione um link ou escolha um arquivo." : "Add a link or choose a file.");
        await auth.api("/artifacts", { method: "POST", body: JSON.stringify({
          kind: String(data.get("kind") || "document") as ArtifactKind,
          label: String(data.get("name") || ""),
          url,
          description: String(data.get("description") || ""),
          tags: [],
          scope: "team",
          ownerId: selected.id,
          fileName: String(data.get("fileName") || ""),
          mimeType: String(data.get("mimeType") || ""),
          size: Number(data.get("size") || 0)
        }) });
        setFeedback(c.sourceAdded);
      }
      setDialog(null);
      await load();
      onTeamsChanged?.();
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setBusy(false);
    }
  }

  async function requestJoin(team: TeamRecord) {
    setBusy(true);
    try {
      await auth.api(`/teams/${team.id}/join-requests`, { method: "POST" });
      await load();
      setSelectedId(team.id);
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setBusy(false);
    }
  }

  async function approve(memberId: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await auth.api(`/teams/${selected.id}/members`, { method: "POST", body: JSON.stringify({ memberId }) });
      await load();
      onTeamsChanged?.();
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam() {
    if (!selected || !window.confirm(c.deleteTeamConfirm)) return;
    setBusy(true);
    try {
      await auth.api(`/teams/${selected.id}`, { method: "DELETE" });
      setSelectedId("");
      setFeedback("");
      await load();
      onTeamsChanged?.();
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteArtifact(artifact: ConnectedArtifact) {
    if (!window.confirm(c.deleteArtifactConfirm)) return;
    setBusy(true);
    try {
      await auth.api(`/artifacts/${artifact.id}`, { method: "DELETE" });
      setFeedback(c.sourceDeleted);
      await load();
    } catch (reason) {
      setFeedback(errorMessage(reason, c.loadError));
    } finally {
      setBusy(false);
    }
  }

  function TeamButton({ team }: { team: TeamRecord }) {
    const count = team.memberCount ?? team.memberIds.length;
    const references = team.artifactCount ?? team.artifactIds.length;
    return <button type="button" className={team.id === selectedId ? "active" : ""} onClick={() => selectTeam(team)}>
      <span><UsersRound aria-hidden="true" /></span>
      <span><strong>{team.name}</strong><small>{count} {count === 1 ? c.member : c.memberCount} · {team.projectCount ?? 0} {c.projectCount}{team.membership === "member" ? ` · ${references} ${c.artifactCount}` : ""}</small></span>
      <ArrowRight aria-hidden="true" />
    </button>;
  }

  const teamList = view === "mine" ? myTeams : otherTeams;

  return <div className="teams-hub-shell">
    <header className="teams-hub-topbar">
      <button type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{c.back}</button>
      <div><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge connectedLabel={t("common.connected")} /></div>
    </header>
    <main className="teams-hub-main">
      <header className="teams-hub-heading"><div><span>{c.eyebrow}</span><h1>{c.title}</h1><p>{c.subtitle}</p></div><button type="button" disabled title={language === "pt" ? "Em breve" : "Coming soon"}><Plus aria-hidden="true" />{c.create}<small>{language === "pt" ? "Em breve" : "Coming soon"}</small></button></header>
      <nav className="teams-hub-tabs" aria-label={c.title}>
        <button className={view === "mine" ? "active mine" : "mine"} type="button" onClick={() => chooseView("mine")}><ShieldCheck aria-hidden="true" />{c.mine}<span>{myTeams.length}</span></button>
        <button className={view === "community" ? "active community" : "community"} type="button" onClick={() => chooseView("community")}><Globe2 aria-hidden="true" />{c.community}<span>{otherTeams.length}</span></button>
      </nav>
      {feedback && <div className="teams-hub-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback("")} aria-label="Fechar"><X aria-hidden="true" /></button></div>}

      {view === "community" && <div className="teams-competition-strip"><Trophy aria-hidden="true" /><div><strong>{c.obsatCommunity}</strong><span>{c.obsatHint}</span></div></div>}
      <div className="teams-hub-layout">
        <aside className="teams-hub-list">
          <header><span>{view === "mine" ? c.mine : c.community}</span><small>{teamList.length} {c.activeCommunity}</small></header>
          {loading ? <LoaderCircle className="teams-hub-spin" aria-hidden="true" /> : <section>{teamList.map((team) => <TeamButton team={team} key={team.id} />)}{teamList.length === 0 && <p>{c.empty}</p>}</section>}
        </aside>

        <section className="teams-hub-detail">
          {!selected ? <div className="teams-hub-placeholder"><UsersRound aria-hidden="true" /><p>{c.empty}</p></div> : selected.membership !== "member" ? <>
            <header className="teams-public-header"><div><span>{c.publicLabel}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><button type="button" disabled={selected.membership === "requested" || busy} onClick={() => void requestJoin(selected)}>{selected.membership === "requested" ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}{selected.membership === "requested" ? c.requested : c.request}</button></header>
            <div className="teams-public-metadata"><span><UsersRound aria-hidden="true" /><small>{c.members}</small><strong>{selected.memberCount ?? 0} {c.memberCount}</strong></span><span><Network aria-hidden="true" /><small>{c.projects}</small><strong>{selected.projectCount ?? 0} {c.projectCount}</strong></span><span><CalendarDays aria-hidden="true" /><small>{c.createdAt}</small><strong>{new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-GB", { month: "short", year: "numeric" }).format(new Date(selected.createdAt))}</strong></span></div>
            <div className="teams-private-notice"><ShieldCheck aria-hidden="true" /><div><strong>{c.privateContent}</strong><p>{c.privateDescription}</p></div></div>
            <p className="teams-public-hint">{c.publicHint}</p>
          </> : <>
            <header><div><span>{c.mine}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>{selected.canManage && <div className="teams-detail-actions"><button className="icon-only" type="button" title={c.editTeam} aria-label={c.editTeam} onClick={() => setDialog("edit-team")}><Pencil aria-hidden="true" /></button><button className="icon-only danger" type="button" title={c.deleteTeam} aria-label={c.deleteTeam} onClick={() => void deleteTeam()}><Trash2 aria-hidden="true" /></button></div>}</header>
            <div className="teams-hub-columns">
              <section><div className="teams-hub-section-title"><h3>{c.members}</h3>{selected.canManage && <button type="button" onClick={() => setDialog("member")}><Plus aria-hidden="true" />{c.addMember}</button>}</div><div className="teams-member-list">{selectedMembers.map((member) => <article key={member.id}><div className={member.avatarUrl ? "teams-avatar has-photo" : "teams-avatar"}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : memberInitials(member.displayName)}</div><div><strong>{member.displayName}</strong><span><Mail aria-hidden="true" />{member.email}</span></div><small>{member.accountStatus === "active" ? (language === "pt" ? "Ativo" : "Active") : (language === "pt" ? "Convidado" : "Invited")}</small></article>)}</div></section>
              <section><div className="teams-hub-section-title"><h3>{c.artifacts}</h3>{selected.canManage && <button type="button" onClick={() => setDialog("artifact")}><Plus aria-hidden="true" />{c.addArtifact}</button>}</div><div className="teams-artifact-list">{selectedArtifacts.map((artifact) => <article key={artifact.id}><a href={artifact.url} target={artifact.url.startsWith("data:") ? undefined : "_blank"} rel={artifact.url.startsWith("data:") ? undefined : "noreferrer"} download={artifact.url.startsWith("data:") ? artifact.fileName || artifact.label : undefined}><span>{artifact.kind === "repository" ? <FolderGit2 aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}</span><div><strong>{artifact.label}</strong><small>{artifact.description || artifact.fileName || artifact.url}</small></div><ArrowRight aria-hidden="true" /></a>{selected.canManage && <button type="button" title={c.deleteArtifact} aria-label={`${c.deleteArtifact}: ${artifact.label}`} onClick={() => void deleteArtifact(artifact)}><Trash2 aria-hidden="true" /></button>}</article>)}{selectedArtifacts.length === 0 && <p>{c.empty}</p>}</div></section>
            </div>
            <section className="teams-projects-section">
              <div className="teams-hub-section-title"><h3>{c.projects}</h3><div className="teams-view-toggle"><button className={projectView === "list" ? "active" : ""} type="button" onClick={() => setProjectView("list")}><List aria-hidden="true" />{c.list}</button><button className={projectView === "hierarchy" ? "active" : ""} type="button" onClick={() => setProjectView("hierarchy")}><Network aria-hidden="true" />{c.hierarchy}</button></div></div>
              {projects.length === 0 ? <p className="teams-empty-copy">{c.noProjects}</p> : projectView === "list" ? <div className="teams-project-list">{projects.map((item) => <article key={item.id}><span className="teams-project-mark"><FolderGit2 aria-hidden="true" /></span><div><strong>{item.name}</strong><small>{item.participants.length} {c.memberCount} · {new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(item.updatedAt))}</small><div>{item.participants.map((participant) => <span key={participant.memberId}>{participant.displayName}<em>{[participant.roleName, participant.sectorName].filter(Boolean).join(" · ")}</em></span>)}</div></div></article>)}</div> : <div className="teams-project-chart">{projects.map((item) => <article key={item.id}><div className="teams-project-node"><FolderGit2 aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.participants.length} {c.memberCount}</small></span></div><div className="teams-project-branches">{item.participants.map((participant) => <div key={participant.memberId}><span className={participant.avatarUrl ? "teams-avatar has-photo" : "teams-avatar"}>{participant.avatarUrl ? <img src={participant.avatarUrl} alt="" /> : memberInitials(participant.displayName)}</span><strong>{participant.displayName}</strong><small>{[participant.roleName, participant.sectorName].filter(Boolean).join(" · ")}</small></div>)}</div></article>)}</div>}
            </section>
            {selected.canManage && joinRequests.length > 0 && <section className="teams-join-requests"><h3>{c.joinRequests}</h3>{joinRequests.map((member) => <div key={member.id}><span>{member.displayName} · {member.email}</span><button type="button" onClick={() => void approve(member.id)}><Check aria-hidden="true" />{c.approve}</button></div>)}</section>}
          </>}
        </section>
      </div>
    </main>

    {dialog && <div className="teams-dialog-backdrop" role="presentation" onPointerDown={() => setDialog(null)}><form className="teams-dialog" onSubmit={(event) => void submit(event)} onPointerDown={(event) => event.stopPropagation()}>
      <header><div><span>{c.eyebrow}</span><h2>{dialog === "edit-team" ? c.editTeam : dialog === "member" ? c.addMember : c.addArtifact}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Fechar"><X aria-hidden="true" /></button></header>
      {(dialog === "edit-team") && <><label><span>{c.teamName}</span><input name="name" defaultValue={dialog === "edit-team" ? selected?.name : ""} required maxLength={100} autoFocus /></label><label><span>{c.description}</span><textarea name="description" defaultValue={dialog === "edit-team" ? selected?.description : ""} maxLength={300} rows={3} /></label></>}
      {dialog === "member" && <><label><span>{c.personName}</span><input name="name" required maxLength={100} autoFocus /></label><label><span>{c.personEmail}</span><input name="email" type="email" required maxLength={254} /></label><p className="teams-dialog-hint">{c.inviteHint}</p></>}
      {dialog === "artifact" && <><label><span>{c.artifactType}</span><select name="kind" defaultValue="document"><option value="document">Documento</option><option value="repository">GitHub</option><option value="dataset">CSV / planilha</option><option value="link">Link</option></select></label><label><span>{c.artifactName}</span><input name="name" required maxLength={120} autoFocus /></label><ArtifactSourceFields language={language} onError={setFeedback} /><label><span>{c.description}</span><textarea name="description" maxLength={300} rows={2} /></label></>}
      <footer><button type="button" onClick={() => setDialog(null)}>{c.cancel}</button><button className="primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="teams-hub-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{c.save}</button></footer>
    </form></div>}
  </div>;
}
