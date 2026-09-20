import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { MissionProject } from '../lib/projectStore';
import type { TeamMember } from '../lib/team';
import type { Language } from '../lib/types';
import { OrganizationTree } from '../components/OrganizationTree';
import { projectOrganization } from '../../shared/organization-tree.mjs';

type Props = { language: Language; project: MissionProject; t: (path: string) => string; onLanguageChange: (language: Language) => void; onBack: () => void; onProjectSetup: () => void };
export function TeamPage({ language, project, onBack, onProjectSetup }: Props) {
  const { api } = useAuth(), pt = language === 'pt';
  const [members, setMembers] = useState<TeamMember[]>([]), [view, setView] = useState<'list' | 'hierarchy'>('list'), [error, setError] = useState('');
  useEffect(() => { void api<{ members: TeamMember[] }>('/team/members').then(r => setMembers(r.members)).catch(e => setError(e.message)); }, [api]);
  return <main className="admin-page"><button type="button" onClick={onBack}><ArrowLeft size={16} />{pt ? 'Voltar à Memória' : 'Back to Memory'}</button><h1>{pt ? 'Equipe do projeto' : 'Project team'} · {project.name}</h1><p>{pt ? 'Setores e responsabilidades definidos na Memória deste projeto.' : 'Sectors and responsibilities defined in this project’s Memory.'}</p><button type="button" onClick={onProjectSetup}>{pt ? 'Configurar equipe do projeto na Memória' : 'Configure project team in Memory'}</button><button type="button" onClick={() => setView(view === 'list' ? 'hierarchy' : 'list')}>{view === 'list' ? (pt ? 'Organograma' : 'Chart') : (pt ? 'Lista' : 'List')}</button>{error && <p role="alert">{error}</p>}<OrganizationTree tree={projectOrganization(project, members)} view={view} language={language} /></main>;
}
