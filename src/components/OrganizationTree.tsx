import { Download } from 'lucide-react';
import type { OrganizationNode } from '../../shared/organization-tree.mjs';
import type { Language } from '../lib/types';

const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
export function exportOrganization(tree: OrganizationNode) {
  const rows: { node: OrganizationNode; depth: number; parent: number | null }[] = [];
  function visit(node: OrganizationNode, depth: number, parent: number | null) { const index = rows.length; rows.push({ node, depth, parent }); node.children.forEach(child => visit(child, depth + 1, index)); }
  visit(tree, 0, null);
  const wrapped = rows.map(({ node }) => node.name.match(/.{1,56}(?:\s|$)|.{1,56}/gu) || [node.name]);
  let nextY = 20;
  const layout = rows.map((row, index) => { const lines = wrapped[index], height = 44 + lines.length * 20, y = nextY; nextY += height + 22; return { ...row, lines, height, y, x: 24 + row.depth * 44 }; });
  const width = Math.max(800, ...rows.map(r => r.depth * 44 + 560));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${nextY + 20}" viewBox="0 0 ${width} ${nextY + 20}"><rect width="100%" height="100%" fill="#101820"/>${layout.map(({ node, parent, x, y, height, lines }) => {
    const parentRow = parent === null ? null : layout[parent];
    return `${parentRow ? `<path d="M${x - 22} ${parentRow.y + parentRow.height} V${y + 30} H${x}" stroke="#627988" fill="none"/>` : ''}<rect x="${x}" y="${y}" width="520" height="${height}" rx="8" fill="#1b2a35" stroke="#627988"/><text x="${x + 16}" y="${y + 26}" fill="#edf4fa" font-family="sans-serif" font-size="16">${lines.map((line, i) => `<tspan x="${x + 16}" dy="${i ? 20 : 0}">${escapeXml(line.trim())}</tspan>`).join('')}</text><text x="${x + 16}" y="${y + height - 14}" fill="#a9c0d0" font-family="sans-serif" font-size="12">${escapeXml(node.role || node.kind)}</text>`;
  }).join('')}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `organograma-${tree.name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 70)}.svg`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OrganizationTree({ tree, view, language, onOpenProject }: { tree: OrganizationNode; view: 'list' | 'hierarchy'; language: Language; onOpenProject?: (id: string) => void }) {
  const pt = language === 'pt';
  function branch(node: OrganizationNode, depth = 0): React.ReactNode {
    const title = <><strong>{node.name}</strong>{node.role && <small>{node.role}</small>}</>;
    return <li key={node.id} className={`org-${node.kind}`}>
      {node.children.length ? <details open={depth < 3}><summary>{title}</summary><ul>{node.children.map(child => branch(child, depth + 1))}</ul></details> : <div className="org-leaf">{title}</div>}
      {node.kind === 'project' && <div className="org-project-actions">{onOpenProject && <button type="button" onClick={() => onOpenProject(node.id)}>{pt ? 'Abrir projeto' : 'Open project'}</button>}<button type="button" onClick={() => exportOrganization(node)}><Download size={14} />{pt ? 'Exportar organograma' : 'Export chart'}</button></div>}
    </li>;
  }
  return <div className={`organization-tree ${view}`}><ul>{branch(tree)}</ul></div>;
}
