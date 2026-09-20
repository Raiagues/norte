import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Minus, Plus } from 'lucide-react';
import type { OrganizationNode } from '../../shared/organization-tree.mjs';
import { layoutOrganization, organizationLines, organizationEdgePath } from '../lib/organizationLayout';
import type { Language } from '../lib/types';

const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
export function exportOrganization(tree: OrganizationNode) {
  const { cards, edges, width, height } = layoutOrganization(tree);
  const paths = edges.map(edge => `<path d="${organizationEdgePath({ cards, edges, width, height }, edge)}" fill="none" stroke="#53718d"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#071727"/>${paths}${cards.map(c => {
    let y = c.y + 25;
    const lines = [{ text: c.node.name, title: true }, ...c.details.map(d => ({ text: d.text, title: false }))];
    return `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="10" fill="#10263b" stroke="#53718d"/>` + lines.map(line => { const result = organizationLines(line.text).map(text => { const t = `<text x="${c.x + 14}" y="${y}" fill="${line.title ? '#f0f6ff' : '#adc5d9'}" font-family="sans-serif" font-size="${line.title ? 14 : 12}">${escapeXml(text)}</text>`; y += line.title ? 19 : 16; return t; }).join(''); y += 8; return result; }).join('');
  }).join('')}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `organograma-${tree.name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 70)}.svg`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function OrganizationChart({ tree, language, onOpenProject, onEdit, editableSectorIds }: Props) {
  const container = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 800, height: 420 }), [zoom, setZoom] = useState(1);
  const diagram = useMemo(() => layoutOrganization(tree), [tree]);
  const pt = language === 'pt';
  useEffect(() => { const observer = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height })); if (container.current) observer.observe(container.current); return () => observer.disconnect(); }, []);
  const scale = Math.min(1, size.width / diagram.width, size.height / diagram.height) * zoom;
  return <div className="org-chart-shell"><div className="org-chart-controls"><button type="button" aria-label={pt ? 'Diminuir zoom' : 'Zoom out'} disabled={zoom <= .5} onClick={() => setZoom(z => Math.max(.5, z - .25))}><Minus size={15} /></button><button type="button" onClick={() => setZoom(1)}><Maximize2 size={14} />{pt ? 'Ajustar' : 'Fit'}</button><button type="button" aria-label={pt ? 'Aumentar zoom' : 'Zoom in'} disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + .25))}><Plus size={15} /></button></div>
    <div className="org-chart-viewport" ref={container} tabIndex={0} aria-label={pt ? 'Organograma da equipe' : 'Team organization chart'}><div className="org-chart-space" style={{ width: Math.max(size.width, diagram.width * scale), height: Math.max(size.height, diagram.height * scale) }}><div className="org-chart-canvas" style={{ width: diagram.width, height: diagram.height, transform: `scale(${scale})`, left: Math.max(0, (size.width - diagram.width * scale) / 2) }}>
      <svg className="org-chart-lines" width={diagram.width} height={diagram.height} aria-hidden="true">{diagram.edges.map(edge => <path key={`${edge.from}:${edge.to}`} d={organizationEdgePath(diagram, edge)} />)}</svg>
      {diagram.cards.map(c => <article key={c.key} className={`org-card org-${c.node.kind}`} style={{ left: c.x, top: c.y, width: c.width, minHeight: c.height }}>
        {onEdit && c.node.kind === 'sector' && (!editableSectorIds || editableSectorIds.includes(c.node.id)) ? <button className="org-card-name" type="button" onClick={() => onEdit(c.node)}>{c.node.name}</button> : <strong>{c.node.name}</strong>}
        {c.details.map((detail, i) => onEdit && detail.memberId ? <button className="org-card-person" type="button" key={i} onClick={() => onEdit({ id: detail.memberId!, memberId: detail.memberId, name: detail.text, kind: 'person', children: [] })}>{detail.text}</button> : <span key={i}>{detail.text}</span>)}
        {c.node.kind === 'project' && <div className="org-card-actions">{onOpenProject && <button type="button" onClick={() => onOpenProject(c.node.id)}>{pt ? 'Abrir projeto' : 'Open project'}</button>}<button type="button" aria-label={pt ? 'Exportar organograma' : 'Export chart'} onClick={() => exportOrganization(c.node)}><Download size={14} /></button></div>}
      </article>)}
    </div></div></div>
  </div>;
}
function localizeTree(tree: OrganizationNode, language: Language): OrganizationNode {
  if (language === 'pt') return tree;
  const labels: Record<string, string> = { 'Responsável pelo projeto': 'Project lead', 'Gerência de setor': 'Sector manager', 'Capitão da equipe': 'Team captain', 'Membro': 'Member', 'Orientador': 'Advisor', 'Participante · leitura': 'Participant · read' };
  const placeholders: Record<string, string> = { 'Gerência não definida': 'Manager not assigned', 'Responsável não definido': 'Project lead not assigned', 'Capitão não definido': 'Captain not assigned' };
  return { ...tree, role: tree.role ? labels[tree.role] || tree.role : undefined, name: tree.kind === 'responsibility' && !tree.memberIds?.length ? placeholders[tree.name] || tree.name : tree.id.endsWith(':unassigned') ? 'Unassigned / support' : tree.name, children: tree.children.map(child => localizeTree(child, language)) };
}
type Props = { tree: OrganizationNode; view: 'list' | 'hierarchy'; language: Language; onOpenProject?: (id: string) => void; onEdit?: (node: OrganizationNode) => void; editableSectorIds?: string[] };
export function OrganizationTree(props: Props) {
  const { view, language, onOpenProject } = props, tree = localizeTree(props.tree, props.language), pt = language === 'pt';
  if (view === 'hierarchy') return <OrganizationChart {...props} tree={tree} />;
  function branch(node: OrganizationNode, depth = 0): React.ReactNode {
    const title = <><strong>{node.name}</strong>{node.role && <small>{node.role}</small>}</>;
    return <li key={node.id} className={`org-${node.kind}`}>
      {node.children.length ? <details open={depth < 3}><summary>{title}</summary><ul>{node.children.map(child => branch(child, depth + 1))}</ul></details> : <div className="org-leaf">{title}</div>}
      {node.kind === 'project' && <div className="org-project-actions">{onOpenProject && <button type="button" onClick={() => onOpenProject(node.id)}>{pt ? 'Abrir projeto' : 'Open project'}</button>}<button type="button" onClick={() => exportOrganization(node)}><Download size={14} />{pt ? 'Exportar organograma' : 'Export chart'}</button></div>}
    </li>;
  }
  return <div className="organization-tree list"><ul>{branch(tree)}</ul></div>;
}
