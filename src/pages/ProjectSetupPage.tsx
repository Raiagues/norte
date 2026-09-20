import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PROJECT_TYPES, suggestedSectors } from '../../shared/project-organization.mjs';
import type { ProjectType } from '../../shared/project-organization.mjs';
import { createEmptyProject } from '../lib/projectStore';
import type { MissionProject } from '../lib/projectStore';
import type { TeamRecord } from '../lib/team';
import type { Language } from '../lib/types';
import { useAuth } from '../lib/auth';
import '../project-context.css';

type Props = { language: Language; teams: TeamRecord[]; onCreate: (project: MissionProject) => Promise<void>; onHome: () => void; onTeams: () => void };
export function ProjectSetupPage({ language, teams, onCreate, onHome, onTeams }: Props) {
  const auth = useAuth(), pt = language === 'pt';
  const [type, setType] = useState<ProjectType>('competition');
  const [sectors, setSectors] = useState(() => suggestedSectors('competition', language));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const eligible = teams.filter(t => t.membership === 'member' || t.memberIds.includes(auth.user?.memberId || '') || auth.user?.accessRole === 'owner_admin');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), team = eligible.find(t => t.id === form.get('team'));
    if (!team || !auth.user) return;
    setBusy(true); setError('');
    try {
      const project = createEmptyProject(language);
      project.name = String(form.get('name') || '').trim();
      project.projectType = type;
      project.setup.statement = String(form.get('statement') || '').trim();
      project.context = { ...project.context, configured: true, referenceProgram: 'independent', teamId: team.id, teamName: team.name, sectors: sectors.filter(s => s.name.trim()).map(s => ({ ...s, name: s.name.trim() })), folders: [], assignments: team.memberIds.includes(auth.user.memberId) ? [{ memberId: auth.user.memberId, roleId: 'captain', sectorId: '' }] : [] };
      await onCreate(project);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o projeto.'); }
    finally { setBusy(false); }
  }
  return <div className="context-shell"><main className="context-main">
    <header className="context-topbar"><button type="button" onClick={onHome}><ArrowLeft />{pt ? 'Voltar' : 'Back'}</button></header>
    <form className="context-workspace" onSubmit={event => void submit(event)}>
      <header className="context-heading"><div><span>{pt ? 'NOVO PROJETO' : 'NEW PROJECT'}</span><h1>{pt ? 'Defina o ponto de partida' : 'Define the starting point'}</h1><p>{pt ? 'Escolha sua equipe e adapte os setores sugeridos. Você pode reorganizá-los depois.' : 'Choose your team and adapt the suggested sectors. You can reorganize them later.'}</p></div></header>
      <div className="context-columns"><section className="context-column">
        <label className="context-field"><span>{pt ? 'Nome do projeto' : 'Project name'}</span><input name="name" required maxLength={120} autoFocus /></label>
        <label className="context-field"><span>{pt ? 'Tipo de projeto' : 'Project type'}</span><select aria-label={pt ? "Tipo de projeto" : "Project type"} value={type} onChange={event => { const next = event.target.value as ProjectType; setType(next); setSectors(suggestedSectors(next, language)); }}>{Object.entries(PROJECT_TYPES).map(([key, value]) => <option value={key} key={key}>{value[language]}</option>)}</select></label>
        <label className="context-field"><span>{pt ? 'Objetivo inicial (opcional)' : 'Initial objective (optional)'}</span><textarea name="statement" maxLength={2000} rows={4} /></label>
        <label className="context-field"><span>{pt ? 'Equipe' : 'Team'}</span><select aria-label={pt ? "Equipe" : "Team"} name="team" required defaultValue={eligible.find(t => t.id === window.localStorage.getItem('norte-default-team-v1'))?.id || eligible[0]?.id || ''}><option value="">{pt ? 'Selecione uma equipe' : 'Select a team'}</option>{eligible.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <button type="button" onClick={onTeams}>{pt ? 'Equipes e convites' : 'Teams and invitations'}</button>
      </section><section className="context-column"><h2>{pt ? 'Setores iniciais' : 'Initial sectors'}</h2><p>{pt ? 'Áreas de responsabilidade e pastas de documentos. A árvore técnica será definida com as fontes do projeto.' : 'Responsibility areas and document folders. The technical tree will be defined using project sources.'}</p>
        <div className="structure-list">{sectors.map(sector => <div className="structure-row" key={sector.id}><input aria-label={pt ? 'Nome do setor' : 'Sector name'} required maxLength={100} value={sector.name} onChange={event => setSectors(current => current.map(s => s.id === sector.id ? { ...s, name: event.target.value } : s))} /><button type="button" aria-label={`${pt ? 'Remover' : 'Remove'} ${sector.name}`} onClick={() => setSectors(current => current.filter(s => s.id !== sector.id))}><Trash2 /></button></div>)}</div>
        <button type="button" onClick={() => setSectors(current => [...current, { id: crypto.randomUUID(), name: '' }])}><Plus />{pt ? 'Adicionar setor' : 'Add sector'}</button>
      </section></div>
      <footer className="context-footer"><p role="alert">{error}</p><button className="primary" type="submit" disabled={busy || !eligible.length || auth.user?.accessRole === 'advisor'}>{busy ? (pt ? 'Criando…' : 'Creating…') : (pt ? 'Criar projeto' : 'Create project')}</button></footer>
    </form>
  </main></div>;
}
