import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { folderPath, folderSector, isProjectAdmin, sectorRole } from '../../shared/project-organization.mjs';
import type { MissionProject } from '../lib/projectStore';
import type { ConnectedArtifact } from '../lib/team';
import type { Language } from '../lib/types';
import { useAuth } from '../lib/auth';

type Props = { project: MissionProject; language: Language; artifacts: ConnectedArtifact[]; selected: string; onSelect: (id: string) => void; onSave: (next: MissionProject) => Promise<void>; activeArtifactId?: string | null; onOpenArtifact?: (id: string) => void };
export function MemoryFolders({ project, language, artifacts, selected, onSelect, onSave, activeArtifactId, onOpenArtifact }: Props) {
  const { user } = useAuth(), pt = language === 'pt', admin = isProjectAdmin(project, user);
  const [edit, setEdit] = useState<{ id: string; sector: boolean; name: string; parentId: string; entityId: string; technicalKind?: "system" | "subsystem" | "component" } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const folders = project.context.folders || [], sectors = project.context.sectors;
  const current = sectors.find(s => s.id === selected) || folders.find(f => f.id === selected);
  const canManage = admin || sectorRole(project, user, folderSector(project, selected)) === 'manager';
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!edit) return;
    setBusy(true); setError('');
    try {
      const id = edit.id || crypto.randomUUID();
      const context = { ...project.context };
      if (edit.sector) {
        context.sectors = edit.id ? sectors.map(s => s.id === id ? { ...s, name: edit.name.trim() } : s) : [...sectors, { id, name: edit.name.trim() }];
      } else {
        const folder = { id, name: edit.name.trim(), parentId: edit.parentId, ...(edit.entityId ? { entityId: edit.entityId } : {}), ...(edit.technicalKind ? { technicalKind: edit.technicalKind } : {}) };
        context.folders = edit.id ? folders.map(f => f.id === id ? folder : f) : [...folders, folder];
      }
      await onSave({ ...project, context }); setEdit(null); onSelect(id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!current) return;
    if (folders.some(f => f.parentId === selected) || artifacts.some(a => a.folderId === selected)) { setError(pt ? 'Mova os arquivos e subpastas antes de excluir.' : 'Move files and subfolders before deleting.'); return; }
    if (!window.confirm(`${pt ? 'Excluir pasta' : 'Delete folder'} “${current.name}”?`)) return;
    setBusy(true); setError('');
    try {
      const context = { ...project.context, sectors: sectors.filter(s => s.id !== selected), folders: folders.filter(f => f.id !== selected), assignments: project.context.assignments.map(a => ({ ...a, sectorId: a.sectorId === selected ? '' : a.sectorId, ...(a.sectorRoles ? { sectorRoles: a.sectorRoles.filter(g => g.sectorId !== selected) } : {}) })) };
      await onSave({ ...project, context }); onSelect('all');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao excluir.'); }
    finally { setBusy(false); }
  }
  function documents(id: string, depth: number) {
    return onOpenArtifact && artifacts.filter(a => (a.folderId || '') === id).map(a => <button key={a.id} type="button" className={`memory-tree-document ${activeArtifactId === a.id ? 'selected' : ''}`} style={{ paddingLeft: 28 + depth * 14 }} onClick={() => onOpenArtifact(a.id)} title={a.canEdit ? (pt ? 'Pode editar' : 'Can edit') : (pt ? 'Somente leitura · edição restrita' : 'Read only · restricted editing')}><FileText size={14} /><span>{a.label}<small>{a.canEdit && a.scope !== 'team' ? (pt ? 'Pode editar' : 'Can edit') : (pt ? 'Somente leitura' : 'Read only')}</small></span></button>);
  }
  function branch(id: string, name: string, depth = 0): React.ReactNode {
    const open = !collapsed.has(id), children = folders.filter(f => f.parentId === id);
    return <div className="engineering-tree-branch" key={id}><div className={`engineering-tree-row ${selected === id ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}><button type="button" className="engineering-tree-toggle" aria-label={`${pt ? 'Expandir ou recolher' : 'Expand or collapse'} ${name}`} aria-expanded={open} onClick={() => setCollapsed(current => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next; })}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><button type="button" aria-current={selected === id ? 'true' : undefined} onClick={() => onSelect(id)}><FolderOpen size={16} /><span><strong>{name}</strong></span><em>{artifacts.filter(a => a.folderId === id).length || ''}</em></button></div>{open && <>{children.map(f => branch(f.id, f.name, depth + 1))}{documents(id, depth + 1)}</>}</div>;
  }
  return <aside className="memory-folders"><h3>{pt ? 'Setores e pastas' : 'Sectors and folders'}</h3>
    <nav aria-label={pt ? 'Pastas da memória' : 'Memory folders'}><button className={selected === 'all' ? 'selected' : ''} type="button" onClick={() => onSelect('all')}>{pt ? 'Todos os artefatos' : 'All artifacts'}</button><button className={selected === '' ? 'selected' : ''} type="button" onClick={() => onSelect('')}>{pt ? 'Sem pasta' : 'Unfiled'}</button>{documents('', 0)}{sectors.map(s => branch(s.id, s.name))}</nav>
    <div className="folder-tools">
      {admin && <button type="button" onClick={() => setEdit({ id: '', name: '', sector: true, parentId: '', entityId: '' })}><Plus size={16} />{pt ? 'Novo setor' : 'New sector'}</button>}
      {current && canManage && <><button type="button" onClick={() => setEdit({ id: '', name: '', sector: false, parentId: selected, entityId: '' })}><Plus size={16} />{pt ? 'Subpasta' : 'Subfolder'}</button><button type="button" onClick={() => setEdit({ id: current.id, name: current.name, technicalKind: folders.find(f => f.id === current.id)?.technicalKind, sector: sectors.some(s => s.id === current.id), parentId: 'parentId' in current ? String(current.parentId) : '', entityId: 'entityId' in current ? String(current.entityId || '') : '' })}><Pencil size={16} />{pt ? 'Organizar' : 'Organize'}</button><button type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />{pt ? 'Excluir' : 'Delete'}</button></>}
    </div>
    {current && <p className="folder-hint">{pt ? 'Sugestões de subpastas: Referências, Desenvolvimento, Testes. Crie apenas as que precisar.' : 'Suggested subfolders: References, Development, Tests. Create only what you need.'}</p>}
    {error && <p role="alert">{error}</p>}
    {edit && <form className="folder-editor" onSubmit={event => void save(event)}><label>{pt ? 'Nome' : 'Name'}<input required autoFocus maxLength={100} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label>
      {!edit.sector && <><label>{pt ? 'Pasta ou objeto técnico?' : 'Folder or technical object?'}<select value={edit.technicalKind || ''} onChange={e => setEdit({ ...edit, technicalKind: e.target.value as typeof edit.technicalKind || undefined })}><option value="">{pt ? 'Pasta de documentos' : 'Document folder'}</option><option value="system">{pt ? 'Sistema' : 'System'}</option><option value="subsystem">{pt ? 'Subsistema' : 'Subsystem'}</option><option value="component">{pt ? 'Componente' : 'Component'}</option></select></label><p className="folder-hint">{pt ? 'Componentes ficam dentro de subsistemas; subsistemas ficam dentro de sistemas. Essa classificação orienta a IA.' : 'Components belong inside subsystems; subsystems belong inside systems. This classification guides AI.'}</p><label>{pt ? 'Dentro de' : 'Inside'}<select required value={edit.parentId} onChange={e => setEdit({ ...edit, parentId: e.target.value })}>{[...sectors, ...folders].filter(f => f.id !== edit.id).map(f => <option key={f.id} value={f.id}>{folderPath(project, f.id)}</option>)}</select></label><label>{pt ? 'Objeto técnico relacionado (opcional)' : 'Related technical object (optional)'}<select value={edit.entityId} onChange={e => setEdit({ ...edit, entityId: e.target.value })}><option value="">{pt ? 'Nenhum' : 'None'}</option>{project.engineeringSystem?.entities.map(e => <option key={e.id} value={e.id}>{e.kind} · {e.name}</option>)}</select></label></>}
      <button type="submit" disabled={busy}>{pt ? 'Salvar' : 'Save'}</button><button type="button" onClick={() => setEdit(null)}>{pt ? 'Cancelar' : 'Cancel'}</button>
    </form>}
  </aside>;
}
