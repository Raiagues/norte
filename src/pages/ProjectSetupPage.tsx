import { useState } from 'react';
import { ArrowRight, FolderKanban, Layers3, UsersRound } from 'lucide-react';
import { PROJECT_TYPES, suggestedSectors } from '../../shared/project-organization.mjs';
import type { ProjectType } from '../../shared/project-organization.mjs';
import { createEmptyProject } from '../lib/projectStore';
import type { MissionProject } from '../lib/projectStore';
import type { TeamRecord } from '../lib/team';
import type { Language } from '../lib/types';
import { useAuth } from '../lib/auth';
import { REFERENCE_PROGRAMS, referenceProgram, programModality } from '../lib/programs';
import { SectorsEditor } from '../components/SectorsEditor';
import { ViewToggle } from '../components/ViewToggle';
import type { OrganizationView } from '../components/ViewToggle';
import { InfoTip } from '../components/InfoTip';

type Props = { language: Language; teams: TeamRecord[]; onCreate: (project: MissionProject) => Promise<void>; onHome: () => void; onTeams: () => void };
export function ProjectSetupPage({ language, teams, onCreate, onHome, onTeams }: Props) {
  const auth = useAuth(), pt = language === 'pt';
  const [type, setType] = useState<ProjectType>('competition'), [name, setName] = useState('');
  const [programId, setProgramId] = useState(''), [modalityId, setModalityId] = useState(''), [categoryId, setCategoryId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { id: string; name: string }[]>>({});
  const [view, setView] = useState<OrganizationView>('list');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const eligible = teams.filter(t => t.membership === 'member' || t.memberIds.includes(auth.user?.memberId || '') || auth.user?.accessRole === 'owner_admin');
  const program = type === 'competition' ? referenceProgram(programId) : null, modality = programModality(program, modalityId);
  const draftKey = `${type}:${program?.id || ''}:${modality?.id || ''}`;
  const sectors = drafts[draftKey] || suggestedSectors(type, language, program?.id, modality?.id);
  const updateSectors = (next: typeof sectors) => setDrafts(current => ({ ...current, [draftKey]: next }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), team = eligible.find(t => t.id === form.get('team'));
    if (!team || !auth.user || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const project = createEmptyProject(language);
      project.name = name.trim(); project.projectType = type;
      project.context = { ...project.context, configured: true, referenceProgram: program ? null : 'independent', programId: program?.id || null, modalityId: modality?.id || null, categoryId: modality?.categories.some(c => c.id === categoryId) ? categoryId : null, teamId: team.id, teamName: team.name, sectors, folders: [], assignments: team.memberIds.includes(auth.user.memberId) ? [{ memberId: auth.user.memberId, roleId: 'captain', sectorId: '' }] : [] };
      await onCreate(project);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (pt ? 'Não foi possível criar o projeto.' : 'Could not create the project.')); }
    finally { setBusy(false); }
  }
  return <main className="project-create"><form onSubmit={event => void submit(event)}>
    <header className="workspace-heading"><div><span className="workspace-eyebrow">{pt ? 'SEU PRÓXIMO PROJETO' : 'YOUR NEXT PROJECT'}</span><h1>{pt ? 'Vamos começar.' : 'Let’s get started.'}</h1></div></header>
    <div className="project-create-grid"><section className="workspace-card project-basics"><header><span className="workspace-card-icon"><FolderKanban size={20} /></span><h2>{pt ? 'Projeto' : 'Project'}</h2></header>
      <label className="workspace-field"><span>{pt ? 'Nome do projeto' : 'Project name'}</span><input name="name" required maxLength={120} autoFocus placeholder={pt ? 'Como seu projeto se chama?' : 'What is your project called?'} value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="workspace-field-pair"><label className="workspace-field"><span>{pt ? 'Tipo de projeto' : 'Project type'}</span><select aria-label={pt ? "Tipo de projeto" : "Project type"} value={type} onChange={e => setType(e.target.value as ProjectType)}>{Object.entries(PROJECT_TYPES).map(([key, value]) => <option value={key} key={key}>{value[language]}</option>)}</select></label><label className="workspace-field"><span>{pt ? 'Equipe' : 'Team'}</span><select aria-label={pt ? "Equipe" : "Team"} name="team" required defaultValue={eligible.find(t => t.id === window.localStorage.getItem('norte-default-team-v1'))?.id || eligible[0]?.id || ''}><option value="">{pt ? 'Selecione' : 'Select'}</option>{eligible.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
      {type === 'competition' && <div className="competition-fields"><label className="workspace-field"><span>{pt ? 'Competição' : 'Competition'}</span><select aria-label={pt ? "Competição" : "Competition"} value={programId} onChange={e => { const next = referenceProgram(e.target.value); setProgramId(e.target.value); setModalityId(next?.modalities[0]?.id || ''); setCategoryId(''); }}><option value="">{pt ? 'Outra / decidir depois' : 'Other / decide later'}</option>{REFERENCE_PROGRAMS.map(p => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></label>
        {program && <div className="workspace-field-pair">{program.modalities.length > 1 && <label className="workspace-field"><span>{pt ? 'Modalidade' : 'Modality'}</span><select aria-label={pt ? "Modalidade" : "Modality"} value={modalityId} onChange={e => { setModalityId(e.target.value); setCategoryId(''); }}>{program.modalities.map(m => <option key={m.id} value={m.id}>{m.label[language]}</option>)}</select></label>}{Boolean(modality?.categories.length) && <label className="workspace-field"><span>{pt ? 'Classe / categoria' : 'Class / category'}</span><select aria-label={pt ? "Classe / categoria" : "Class / category"} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">{pt ? 'Decidir depois' : 'Decide later'}</option>{modality?.categories.map(c => <option key={c.id} value={c.id}>{c.label[language]}</option>)}</select></label>}</div>}
      </div>}
      {!eligible.length && <p className="workspace-empty">{pt ? 'Crie uma equipe ou aceite um convite para começar.' : 'Create a team or accept an invitation to get started.'}</p>}
      <button className="workspace-text-button" type="button" onClick={onTeams}><UsersRound size={16} />{pt ? 'Equipes e convites' : 'Teams and invitations'}<ArrowRight size={14} /></button>
    </section><section className="workspace-card project-sectors"><header><span className="workspace-card-icon teal"><Layers3 size={20} /></span><h2>{pt ? 'Setores' : 'Sectors'}<span className="count-badge">{sectors.length}</span></h2><InfoTip label={pt ? 'Sobre os setores' : 'About sectors'}>{pt ? 'Sugestões de áreas de trabalho para sua modalidade. Edite, adicione ou remova. Os setores organizam pessoas e documentos; não definem a arquitetura técnica.' : 'Suggested work areas for your modality. Edit, add or remove them. Sectors organize people and documents; they do not define the technical architecture.'}</InfoTip></header>
      <div className="sectors-view-bar"><span>{program?.shortName || PROJECT_TYPES[type][language]}</span><ViewToggle value={view} onChange={setView} language={language} /></div>
      <SectorsEditor sectors={sectors} onChange={updateSectors} language={language} view={view} projectName={name} />
    </section></div>
    <footer className="project-create-footer"><button type="button" onClick={onHome}>{pt ? 'Cancelar' : 'Cancel'}</button><p role="alert">{error}</p><button className="primary" type="submit" disabled={busy || !name.trim() || !eligible.length || auth.user?.accessRole === 'advisor'}>{busy ? (pt ? 'Criando…' : 'Creating…') : (pt ? 'Criar projeto' : 'Create project')}<ArrowRight size={16} /></button></footer>
  </form></main>;
}
