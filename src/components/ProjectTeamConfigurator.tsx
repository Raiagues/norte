import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, List, Network, Plus, Trash2, Undo2 } from 'lucide-react';
import { isProjectAdmin, sectorRole } from '../../shared/project-organization.mjs';
import { projectOrganization } from '../../shared/organization-tree.mjs';
import { OrganizationTree } from './OrganizationTree';
import { useAuth } from '../lib/auth';
import type { MissionProject, ProjectContext, ProjectMemberAssignment } from '../lib/projectStore';
import type { TeamMember, TeamRecord } from '../lib/team';
import type { Language } from '../lib/types';
import '../project-team-configurator.css';

type Draft = Pick<ProjectContext, 'roles' | 'sectors' | 'assignments'>;
type Props = { language: Language; context: ProjectContext; project: MissionProject; team: TeamRecord; members: TeamMember[]; onSave: (patch: Draft) => void | Promise<void>; onClose: () => void };
export function ProjectTeamConfigurator({ language, context, project, team, members, onSave, onClose }: Props) {
  const { user } = useAuth(), pt = language === 'pt', admin = isProjectAdmin(project, user);
  const [draft, setDraft] = useState<Draft>(() => structuredClone({ roles: context.roles, sectors: context.sectors, assignments: context.assignments }));
  const [history, setHistory] = useState<Draft[]>([]), [tab, setTab] = useState<'sectors' | 'members'>('sectors');
  const [view, setView] = useState<'list' | 'hierarchy'>('list'), [search, setSearch] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [newRole, setNewRole] = useState('');
  const teamMembers = members.filter(m => team.memberIds.includes(m.id));
  const tree = useMemo(() => projectOrganization({ ...project, context: { ...context, ...draft } }, members), [project, context, draft, members]);
  const roleName = (id: string, name: string) => ({ captain: pt ? 'Responsável pelo projeto' : 'Project lead', manager: pt ? 'Gerente de setor' : 'Sector manager', member: pt ? 'Membro' : 'Member', advisor: pt ? 'Orientador' : 'Advisor' })[id] || name;
  function change(next: Draft) { setHistory(h => [...h.slice(-19), structuredClone(draft)]); setDraft(next); }
  function assignment(memberId: string, patch: Partial<ProjectMemberAssignment>) { change({ ...draft, assignments: draft.assignments.map(a => a.memberId === memberId ? { ...a, ...patch } : a) }); }
  function move(index: number, direction: number) { const sectors = [...draft.sectors]; const [item] = sectors.splice(index, 1); sectors.splice(index + direction, 0, item); change({ ...draft, sectors }); }
  function removeSector(id: string) {
    if (!window.confirm(pt ? 'Remover este setor? Pastas ou documentos vinculados impedem a remoção.' : 'Remove this sector? Linked files and folders prevent removal.')) return;
    change({ ...draft, sectors: draft.sectors.filter(s => s.id !== id), assignments: draft.assignments.map(a => ({ ...a, sectorId: a.sectorId === id ? '' : a.sectorId, ...(a.sectorRoles ? { sectorRoles: a.sectorRoles.filter(g => g.sectorId !== id) } : {}) })) });
  }
  return <section className="ptc-root">
    <p className="ptc-intro">{pt ? 'Organize os setores e os participantes deste projeto. Pessoas novas devem aceitar um convite na página da equipe antes de serem selecionadas aqui.' : 'Organize this project’s sectors and participants. New people must accept a team invitation before they can be selected here.'}</p>
    <div className="ptc-toolbar"><div className="ptc-tabs" role="tablist" aria-label={pt ? 'Equipe do projeto' : 'Project team'}><button role="tab" aria-selected={tab === 'sectors'} className={tab === 'sectors' ? 'active' : ''} type="button" onClick={() => setTab('sectors')}>{pt ? 'Setores' : 'Sectors'}</button><button role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'active' : ''} type="button" onClick={() => setTab('members')}>{pt ? 'Cargos e membros' : 'Roles and members'}</button></div><button type="button" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setDraft(previous); setHistory(h => h.slice(0, -1)); } }}><Undo2 size={16} />{pt ? 'Desfazer' : 'Undo'}</button></div>
    {tab === 'sectors' ? <div className="ptc-sector-list">{draft.sectors.map((sector, index) => <article key={sector.id}><span><small>{pt ? 'Setor' : 'Sector'} {index + 1}</small><input aria-label={`${pt ? 'Nome do setor' : 'Sector name'} ${index + 1}`} disabled={!admin} value={sector.name} maxLength={100} onChange={e => change({ ...draft, sectors: draft.sectors.map(s => s.id === sector.id ? { ...s, name: e.target.value } : s) })} /></span><button type="button" title={pt ? 'Mover acima' : 'Move up'} disabled={!admin || index === 0} onClick={() => move(index, -1)}><ArrowUp /></button><button type="button" title={pt ? 'Mover abaixo' : 'Move down'} disabled={!admin || index === draft.sectors.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button><button type="button" title={pt ? 'Remover setor' : 'Remove sector'} disabled={!admin} onClick={() => removeSector(sector.id)}><Trash2 /></button></article>)}<button type="button" className="ptc-add-structure" disabled={!admin} onClick={() => change({ ...draft, sectors: [...draft.sectors, { id: crypto.randomUUID(), name: pt ? 'Novo setor' : 'New sector' }] })}><Plus />{pt ? 'Adicionar setor' : 'Add sector'}</button></div> : <div className="project-participants">
      <label>{pt ? 'Selecionar membros da equipe' : 'Select team members'}<input type="search" value={search} placeholder={pt ? 'Pesquisar nome ou nickname' : 'Search name or nickname'} onChange={e => setSearch(e.target.value)} /></label>
      {teamMembers.filter(m => `${m.displayName} ${m.nickname || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(member => {
        const a = draft.assignments.find(item => item.memberId === member.id);
        return <article key={member.id}><label className="participant-select"><input type="checkbox" checked={Boolean(a)} disabled={!admin} onChange={() => change({ ...draft, assignments: a ? draft.assignments.filter(item => item.memberId !== member.id) : [...draft.assignments, { memberId: member.id, roleId: 'member', sectorId: '' }] })} /><strong>{member.displayName}</strong><small>{member.nickname ? `@${member.nickname}` : ''}</small></label>
          {a && <><label>{pt ? 'Responsabilidade no projeto' : 'Project responsibility'}<select disabled={!admin} value={a.roleId} onChange={e => assignment(member.id, { roleId: e.target.value })}>{draft.roles.map(r => <option key={r.id} value={r.id}>{roleName(r.id, r.name)}</option>)}</select></label><div className="sector-grants">{draft.sectors.map(sector => {
            const current = a.sectorRoles?.find(g => g.sectorId === sector.id)?.role || (a.sectorId === sector.id ? a.roleId === 'manager' ? 'manager' : 'member' : '');
            const canDelegate = sectorRole(project, user, sector.id) === 'manager' && member.id !== user?.memberId && current !== 'manager' && !['captain', 'advisor'].includes(a.roleId);
            return <label key={sector.id}>{sector.name}<select aria-label={`${member.displayName} · ${sector.name}`} disabled={!admin && !canDelegate} value={current} onChange={e => {
              const value = e.target.value as 'manager' | 'member' | 'viewer' | '';
              assignment(member.id, { ...(admin && !value && a.sectorId === sector.id ? { sectorId: '' } : {}), sectorRoles: [...(a.sectorRoles || []).filter(g => g.sectorId !== sector.id), ...(value ? [{ sectorId: sector.id, role: value }] : [])] });
            }}><option value="" disabled={!admin}>{pt ? 'Não participa deste setor' : 'Not assigned here'}</option><option value="viewer">{pt ? 'Participante · leitura' : 'Participant · read'}</option><option value="member">{pt ? 'Membro · edição' : 'Member · edit'}</option><option value="manager" disabled={!admin}>{pt ? 'Gerente do setor' : 'Sector manager'}</option></select></label>;
          })}</div></>}
        </article>;
      })}
      {admin && <details><summary>{pt ? 'Cargo específico (opcional)' : 'Custom role (optional)'}</summary><input aria-label={pt ? 'Nome do cargo' : 'Role name'} value={newRole} maxLength={100} onChange={e => setNewRole(e.target.value)} /><button type="button" disabled={!newRole.trim()} onClick={() => { change({ ...draft, roles: [...draft.roles, { id: crypto.randomUUID(), name: newRole.trim() }] }); setNewRole(''); }}>{pt ? 'Adicionar cargo' : 'Add role'}</button></details>}
    </div>}
    <div className="ptc-toolbar"><strong>{pt ? 'Organização do projeto' : 'Project organization'}</strong><div className="ptc-segmented"><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List />{pt ? 'Lista' : 'List'}</button><button type="button" className={view === 'hierarchy' ? 'active' : ''} onClick={() => setView('hierarchy')}><Network />{pt ? 'Organograma' : 'Chart'}</button></div></div>
    <OrganizationTree tree={tree} view={view} language={language} />
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>{pt ? 'Cancelar' : 'Cancel'}</button><button className="primary" type="button" disabled={saving} onClick={async () => { setSaving(true); setError(''); try { await onSave(draft); } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar'); } finally { setSaving(false); } }}><Check />{pt ? 'Salvar configuração' : 'Save configuration'}</button></footer>
  </section>;
}
