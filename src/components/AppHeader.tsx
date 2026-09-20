import { ArrowLeft, ChevronRight } from 'lucide-react';
import { LanguageToggle } from './LanguageToggle';
import { UserBadge } from './UserBadge';
import type { Language } from '../lib/types';

export function AppHeader({ language, title, onHome, onLanguageChange, canManageTeams }: { language: Language; title: string; onHome?: () => void; onLanguageChange: (language: Language) => void; canManageTeams: boolean }) {
  return <header className="app-header">
    <nav aria-label={language === 'pt' ? 'Localização' : 'Location'}>
      {onHome && <button type="button" onClick={onHome} aria-label={language === 'pt' ? 'Voltar ao início' : 'Back to home'}><ArrowLeft size={18} /></button>}
      <span className="app-header-brand">NORTE</span>{title && <><ChevronRight size={14} /><span className="app-header-title">{title}</span></>}
    </nav>
    <div className="app-header-account"><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge language={language} connectedLabel={language === 'pt' ? 'Conectado' : 'Connected'} canManageTeams={canManageTeams} /></div>
  </header>;
}
