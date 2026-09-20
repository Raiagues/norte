import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, LockKeyhole, Pencil, X } from 'lucide-react';
import { folderPath } from '../../shared/project-organization.mjs';
import { MemoryFolders } from './MemoryFolders';
import { API_ORIGIN } from '../lib/auth';
import { artifactHref } from '../lib/artifacts';
import type { ConnectedArtifact } from '../lib/team';
import type { MissionProject } from '../lib/projectStore';
import type { Language } from '../lib/types';
export function ArtifactPermission({ artifact, language }: { artifact: ConnectedArtifact; language: Language }) {
  const pt = language === 'pt', edit = artifact.scope !== 'team' && artifact.canEdit;
  return <span className={`artifact-permission ${edit ? 'editable' : 'readonly'}`} title={edit ? (pt ? 'Você pode editar este documento.' : 'You can edit this document.') : artifact.editReason || (pt ? 'Edição restrita aos responsáveis pelo setor.' : 'Editing is restricted to sector participants.')}>
    {edit ? <Pencil size={13} /> : <LockKeyhole size={13} />}{edit ? (pt ? 'Pode editar' : 'Can edit') : (pt ? 'Somente leitura' : 'Read only')}
  </span>;
}
export function MemoryWorkspace({ project, artifacts, language, selectedId, onSelect, folderId, onFolder, onSave, onEdit, onClose }: { project: MissionProject; artifacts: ConnectedArtifact[]; language: Language; selectedId: string | null; onSelect: (id: string) => void; folderId: string; onFolder: (id: string) => void; onSave: (next: MissionProject) => Promise<void>; onEdit: (artifact: ConnectedArtifact) => void; onClose: () => void }) {
  const pt = language === 'pt', artifact = artifacts.find(a => a.id === selectedId);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const [text, setText] = useState(''), [error, setError] = useState('');
  const source = artifact ? artifact.documentText !== undefined ? `${API_ORIGIN}/api/artifacts/${artifact.id}/pdf` : artifactHref(artifact) : '';
  const pdf = artifact?.documentText !== undefined || artifact?.mimeType === 'application/pdf';
  const textPreview = artifact?.mimeType?.startsWith('text/') && artifact.documentText === undefined;
  useEffect(() => {
    setText(''); setError('');
    if (!artifact?.contentPath || !textPreview) return;
    const controller = new AbortController();
    void fetch(source, { credentials: 'include', signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(pt ? 'Documento indisponível. Seu acesso pode ter mudado.' : 'Document unavailable. Access may have changed.'); setText(await r.text()); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [source, artifact?.contentPath, textPreview, pt]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, iframe') || []).filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <section ref={dialogRef} className="memory-workspace" role="dialog" aria-modal="true" aria-label={pt ? 'Memória expandida' : 'Expanded memory'}>
    <header><div><small>{pt ? 'MEMÓRIA DO PROJETO' : 'PROJECT MEMORY'}</small><strong>{project.name}</strong></div><button type="button" onClick={onClose}><X size={18} />{pt ? 'Recolher navegação' : 'Collapse workspace'}</button></header>
    <div className="memory-workspace-body"><MemoryFolders project={project} language={language} artifacts={artifacts} selected={folderId} onSelect={onFolder} onSave={onSave} activeArtifactId={selectedId} onOpenArtifact={id => { onSelect(id); onFolder(artifacts.find(a => a.id === id)?.folderId || ''); }} />
      <div className="memory-preview"><nav aria-label={pt ? 'Documentos da pasta' : 'Folder documents'}>{artifacts.filter(a => folderId === 'all' || (a.folderId || '') === folderId).map(a => <button key={a.id} type="button" className={a.id === selectedId ? 'selected' : ''} onClick={() => onSelect(a.id)}><FileText size={14} />{a.label}<ArtifactPermission artifact={a} language={language} /></button>)}</nav>
        {artifact ? <><div className="memory-preview-heading"><p className="memory-breadcrumb">{project.name} / {folderPath(project, artifact.folderId) || (pt ? 'Sem pasta' : 'Unfiled')} / {artifact.label}</p><h2>{artifact.label}</h2><ArtifactPermission artifact={artifact} language={language} />{(!artifact.canEdit || artifact.scope === 'team') && <p>{artifact.scope === 'team' ? (pt ? 'Referência preservada da antiga biblioteca da equipe. Disponível para leitura neste projeto.' : 'Preserved team library reference, available to read in this project.') : artifact.editReason || (pt ? 'A edição é restrita aos participantes autorizados deste setor. Você pode ler e baixar este documento.' : 'Editing is restricted to authorized sector participants. You can read and download this document.')}</p>}<div className="memory-preview-actions">{artifact.canEdit && artifact.scope !== 'team' && <button type="button" onClick={() => onEdit(artifact)}><Pencil size={16} />{pt ? 'Editar documento' : 'Edit document'}</button>}<a href={pdf ? `${source}?download=1` : `${source}${artifact.contentPath ? '?download=1' : ''}`} download={artifact.contentPath ? artifact.fileName || artifact.label : undefined} target={artifact.contentPath ? undefined : '_blank'} rel="noreferrer"><Download size={16} />{pt ? 'Baixar / abrir original' : 'Download / open original'}</a></div></div>
          {error ? <p role="alert">{error}</p> : pdf && artifact.contentPath ? <iframe title={artifact.label} src={source} /> : artifact.contentPath && artifact.mimeType?.startsWith('image/') ? <img className="memory-image" src={source} alt={artifact.label} /> : textPreview && artifact.contentPath ? <pre className="memory-text-preview">{text}</pre> : <div className="memory-preview-fallback"><FileText /><p>{pt ? 'Este formato pode ser aberto no aplicativo de origem.' : 'Open this format in its original application.'}</p><a href={source} target="_blank" rel="noreferrer"><ExternalLink size={16} />{pt ? 'Abrir artefato' : 'Open artifact'}</a></div>}
        </> : <div className="memory-preview-fallback"><FileText /><p>{pt ? 'Selecione um documento na árvore ou na lista desta pasta.' : 'Select a document in the tree or folder list.'}</p></div>}
        <p className="memory-access-note">{pt ? 'Documentos sem permissão de acesso não aparecem nesta navegação.' : 'Documents without access permission are not listed here.'}</p>
      </div>
    </div>
  </section>;
}
