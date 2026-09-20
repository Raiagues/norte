import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Globe2, List, LoaderCircle, Network, Pencil, Plus, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react';
import { OrganizationTree } from '../components/OrganizationTree';
import { TeamInvitations } from '../components/TeamInvitations';
import { teamOrganization } from '../../shared/organization-tree.mjs';
import { useAuth } from '../lib/auth';
import { memberInitials } from '../lib/team';
import type { TeamMember, TeamProjectSummary, TeamRecord } from '../lib/team';
import type { Language } from '../lib/types';
import '../teams-hub.css';
type Props = { language: Language; t: (path: string) => string; onLanguageChange: (language: Language) => void; onBack: () => void; initialTeamId?: string; onTeamsChanged?: () => void; onOpenProject: (id: string) => void };
export function TeamsHubPage({ language, initialTeamId = '', onTeamsChanged, onOpenProject }: Props) {
  const { api } = useAuth(), pt = language === 'pt';
  const [teams, setTeams] = useState<TeamRecord[]>([]), [members, setMembers] = useState<TeamMember[]>([]), [projects, setProjects] = useState<TeamProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState(initialTeamId), [view, setView] = useState<'mine' | 'community'>('mine'), [projectView, setProjectView] = useState<'list' | 'hierarchy'>('list');
  const [dialog, setDialog] = useState<'create-team' | 'edit-team' | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [feedback, setFeedback] = useState('');
  const load = useCallback(async () => {
    try { const [ts, ms] = await Promise.all([api<{ teams: TeamRecord[] }>('/teams'), api<{ members: TeamMember[] }>('/team/members')]); setTeams(ts.teams); setMembers(ms.members); }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Falha ao carregar.'); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { document.body.classList.add('teams-window-scroll'); void load(); return () => document.body.classList.remove('teams-window-scroll'); }, [load]);
  const teamList = teams.filter(team => view === 'mine' ? team.membership === 'member' || team.canManage : team.membership !== 'member' && !team.canManage);
  const selected = teamList.find(team => team.id === selectedId) || teamList[0] || null;
  const selectedTeamId = selected?.id, internal = selected?.membership === 'member' || selected?.canManage;
  const selectedMembers = members.filter(m => selected?.memberIds.includes(m.id));
  useEffect(() => {
    if (!selectedTeamId) { setProjects([]); return; }
    let active = true; setProjects([]);
    void api<{ projects: TeamProjectSummary[] }>(`/teams/${selectedTeamId}/projects`).then(r => { if (active) setProjects(r.projects); }).catch(e => { if (active) setFeedback(e.message); });
    if (!internal) void api(`/teams/${selectedTeamId}/visit`, { method: 'POST' }).catch(() => undefined);
    return () => { active = false; };
  }, [api, selectedTeamId, internal]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setFeedback('');
    try {
      const body = { name: String(data.get('name') || ''), description: String(data.get('description') || ''), ...(dialog === 'edit-team' && data.get('captainMemberId') ? { captainMemberId: data.get('captainMemberId') } : {}) };
      const r = await api<{ team: TeamRecord }>(dialog === 'create-team' ? '/teams' : `/teams/${selected?.id}`, { method: dialog === 'create-team' ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      setSelectedId(r.team.id); setView('mine'); setDialog(null); await load(); onTeamsChanged?.();
    } catch (e) { setFeedback(e instanceof Error ? e.message : 'Falha ao salvar.'); } finally { setBusy(false); }
  }
  async function deleteTeam() {
    if (!selected || !window.confirm(pt ? 'Excluir esta equipe? Equipes com projetos ou documentos preservados não podem ser excluídas.' : 'Delete this team? Teams with projects or archived files cannot be deleted.')) return;
    setBusy(true); try { await api(`/teams/${selected.id}`, { method: 'DELETE' }); await load(); onTeamsChanged?.(); } catch (e) { setFeedback(e instanceof Error ? e.message : 'Falha ao excluir.'); } finally { setBusy(false); }
  }
  return <div className="teams-hub-shell">
    <main className="teams-hub-main"><header className="teams-hub-heading"><div><span>{pt ? 'COLABORAÇÃO' : 'COLLABORATION'}</span><h1>{pt ? 'Equipes' : 'Teams'}</h1><p>{pt ? 'Uma equipe, diferentes projetos e responsabilidades.' : 'One team, different projects and responsibilities.'}</p></div><button type="button" onClick={() => setDialog('create-team')}><Plus />{pt ? 'Criar equipe' : 'Create team'}</button></header>
      <nav className="teams-hub-tabs"><button type="button" className={view === 'mine' ? 'active mine' : 'mine'} onClick={() => setView('mine')}><ShieldCheck />{pt ? 'Minhas equipes' : 'My teams'}</button><button type="button" className={view === 'community' ? 'active community' : 'community'} onClick={() => setView('community')}><Globe2 />{pt ? 'Comunidade' : 'Community'}</button></nav>
      {feedback && <p className="teams-hub-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback('')} aria-label={pt ? 'Fechar' : 'Close'}><X /></button></p>}
      <div className="teams-hub-layout"><aside className="teams-hub-list"><header>{pt ? 'Equipes' : 'Teams'}</header>{loading ? <LoaderCircle /> : <section>{teamList.map(team => <button type="button" key={team.id} className={team.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(team.id)}><span><UsersRound /></span><span><strong>{team.name}</strong><small>{team.memberCount ?? team.memberIds.length} {pt ? 'pessoas' : 'people'} · {team.projectCount || 0} {pt ? 'projetos' : 'projects'}</small></span><ArrowRight /></button>)}</section>}</aside>
        <section className="teams-hub-detail">{!selected ? <p>{pt ? 'Nenhuma equipe por aqui ainda.' : 'No teams here yet.'}</p> : <><header><div><span>{internal ? (pt ? 'SUA EQUIPE' : 'YOUR TEAM') : (pt ? 'PERFIL PÚBLICO' : 'PUBLIC PROFILE')}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>{selected.canManage && <div className="teams-detail-actions"><button className="icon-only" type="button" aria-label={pt ? 'Editar equipe' : 'Edit team'} onClick={() => setDialog('edit-team')}><Pencil /></button><button className="icon-only danger" type="button" aria-label={pt ? 'Excluir equipe' : 'Delete team'} disabled={busy} onClick={() => void deleteTeam()}><Trash2 /></button></div>}</header>
          {internal ? <>
            <section className="teams-projects-section"><div className="teams-hub-section-title"><h3>{pt ? 'PROJETOS E ORGANIZAÇÃO' : 'PROJECTS AND ORGANIZATION'}</h3><div className="teams-view-toggle"><button type="button" className={projectView === 'list' ? 'active' : ''} onClick={() => setProjectView('list')}><List />{pt ? 'Lista' : 'List'}</button><button type="button" className={projectView === 'hierarchy' ? 'active' : ''} onClick={() => setProjectView('hierarchy')}><Network />{pt ? 'Organograma' : 'Chart'}</button></div></div>
              <OrganizationTree tree={teamOrganization(selected, selectedMembers, projects)} view={projectView} language={language} onOpenProject={onOpenProject} />
              <button className="team-new-project" type="button" onClick={() => { window.localStorage.setItem('norte-default-team-v1', selected.id); window.location.hash = '#/new-project'; }}><Plus size={16} />{pt ? 'Criar projeto nesta equipe' : 'Create project in this team'}</button>
            </section>
            <section><h3>{pt ? 'MEMBROS DA EQUIPE' : 'TEAM MEMBERS'}</h3><div className="teams-member-list">{selectedMembers.map(m => <article key={m.id}><div className="teams-avatar">{memberInitials(m.displayName)}</div><div><strong>{m.displayName}</strong><span>{m.nickname ? `@${m.nickname}` : (pt ? 'Perfil preservado' : 'Preserved profile')}{m.id === selected.captainMemberId ? (pt ? ' · Capitão da equipe' : ' · Team captain') : ''}</span></div>{selected.canManage && m.id !== selected.captainMemberId && <button type="button" title={pt ? 'Remover da equipe' : 'Remove from team'} onClick={async () => { if (!window.confirm(`${pt ? 'Remover' : 'Remove'} ${m.displayName}?`)) return; try { await api(`/teams/${selected.id}/members/${m.id}`, { method: 'DELETE' }); await load(); setProjects((await api<{ projects: TeamProjectSummary[] }>(`/teams/${selected.id}/projects`)).projects); } catch (e) { setFeedback(e instanceof Error ? e.message : 'Falha ao remover.'); } }}><Trash2 size={16} /></button>}</article>)}</div></section>
            <p className="activity-notice">{pt ? 'Responsáveis autorizados veem último acesso e resumos de participação nos projetos por 30 dias: dias ativos, acessos, criação e edição de artefatos e mudanças na organização. Não são registrados movimentos, cliques, documentos abertos nem horas de produtividade.' : 'Authorized leaders see last access and 30-day project participation summaries: active days, visits, artifact creation and edits, and organization changes. Mouse movement, clicks, opened documents and productivity hours are not recorded.'}</p>
            {selected.canManage && <><TeamInvitations key={selected.id} teamId={selected.id} language={language} /></>}
          </> : <><p>{pt ? 'A participação acontece por convite. Compartilhe seu nickname com a equipe para que ela possa encontrar seu perfil.' : 'Membership is by invitation. Share your nickname so the team can find your profile.'}</p><h3>{pt ? 'Projetos públicos' : 'Public projects'}</h3>{projects.map(p => <article className="public-project-summary" key={p.id}><Network size={18} /><strong>{p.name}</strong></article>)}{!projects.length && <p>{pt ? 'Esta equipe ainda não publicou resumos de projetos.' : 'This team has not published project summaries yet.'}</p>}<p>{pt ? 'Pessoas, documentos e estatísticas internas têm acesso restrito.' : 'People, files and internal insights have restricted access.'}</p></>}
        </>}</section>
      </div>
    </main>
    {dialog && <div className="teams-dialog-backdrop" role="presentation" onPointerDown={() => setDialog(null)}><form className="teams-dialog" role="dialog" aria-modal="true" aria-label={dialog === 'create-team' ? (pt ? 'Criar equipe' : 'Create team') : (pt ? 'Editar equipe' : 'Edit team')} onSubmit={e => void submit(e)} onPointerDown={e => e.stopPropagation()}><header><h2>{dialog === 'create-team' ? (pt ? 'Criar equipe' : 'Create team') : (pt ? 'Editar equipe' : 'Edit team')}</h2><button type="button" onClick={() => setDialog(null)} aria-label={pt ? 'Fechar' : 'Close'}><X /></button></header><label>{pt ? 'Nome da equipe' : 'Team name'}<input name="name" required minLength={2} maxLength={100} defaultValue={dialog === 'edit-team' ? selected?.name : ''} /></label><label>{pt ? 'Descrição' : 'Description'}<textarea name="description" maxLength={300} defaultValue={dialog === 'edit-team' ? selected?.description : ''} /></label>{dialog === 'edit-team' && <label>{pt ? 'Capitão da equipe' : 'Team captain'}<select name="captainMemberId" defaultValue={selected?.captainMemberId || ''}><option value="" disabled>{pt ? 'Selecione' : 'Select'}</option>{selectedMembers.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>}{feedback && <p role="alert">{feedback}</p>}<footer><button type="button" onClick={() => setDialog(null)}>{pt ? 'Cancelar' : 'Cancel'}</button><button className="primary" type="submit" disabled={busy}><Check />{pt ? 'Salvar' : 'Save'}</button></footer></form></div>}
  </div>;
}
