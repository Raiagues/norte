import { useState } from "react";
import { ChevronDown, ChevronRight, Component, Layers, Network, Search } from "lucide-react";
import type { EngineeringSystemModel } from "../lib/engineeringSystem";
import { engineeringAncestors, engineeringLabel, engineeringParentId } from "../lib/engineeringUi";
import type { Language } from "../lib/types";

export function EngineeringExplorer({ model, language, selectedId, onSelect, onOverview }: {
  model: EngineeringSystemModel; language: Language; selectedId: string | null;
  onSelect: (id: string) => void; onOverview: () => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const pt = language === "pt";
  const entities = model.entities;
  const match = (name: string) => name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const shown = query ? new Set(entities.filter((entity) => match(entity.name)).flatMap((entity) => engineeringAncestors(model, entity.id).map((item) => item.id))) : null;
  function branch(parent: string | undefined, depth = 0, visited = new Set<string>()): React.ReactNode {
    return entities.filter((entity) => (engineeringParentId(model, entity) || undefined) === parent && !visited.has(entity.id) && (!shown || shown.has(entity.id))).map((entity) => {
      const children = entities.filter((child) => engineeringParentId(model, child) === entity.id);
      const open = Boolean(query) || !collapsed.has(entity.id);
      const Icon = entity.kind === "system" ? Network : entity.kind === "subsystem" ? Layers : Component;
      return <div className="engineering-tree-branch" key={entity.id}>
        <div className={`engineering-tree-row ${selectedId === entity.id ? "active" : ""}`} style={{ paddingLeft: 10 + depth * 14 }}>
          {children.length ? <button type="button" className="engineering-tree-toggle" aria-label={`${pt ? "Expandir ou recolher" : "Expand or collapse"} ${entity.name}`} aria-expanded={open} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(entity.id)) next.delete(entity.id); else next.add(entity.id); return next; })}>{open ? <ChevronDown /> : <ChevronRight />}</button> : <span className="engineering-tree-spacer" />}
          <button type="button" aria-current={selectedId === entity.id ? "true" : undefined} onClick={() => onSelect(entity.id)} title={entity.name}><Icon /><span><strong>{entity.name}</strong><small>{engineeringLabel(entity.kind, language)}</small></span>{children.length > 0 && <em>{children.length}</em>}</button>
        </div>
        {open && branch(entity.id, depth + 1, new Set([...visited, entity.id]))}
      </div>;
    });
  }
  return <aside className="engineering-explorer" aria-label={pt ? "Hierarquia do sistema" : "System hierarchy"}>
    <header><span>{pt ? "ARQUITETURA" : "ARCHITECTURE"}</span><small>{entities.length} {pt ? "elementos" : "elements"}</small></header>
    <label className="engineering-tree-search"><Search /><input type="search" aria-label={pt ? "Buscar elemento" : "Find element"} placeholder={pt ? "Buscar no sistema…" : "Find in system…"} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <button type="button" className="engineering-overview-link" onClick={onOverview}><Network />{pt ? "Visão geral" : "Overview"}</button>
    <nav>{branch(undefined)}{query && !shown?.size && <p>{pt ? "Nenhum elemento encontrado." : "No matching elements."}</p>}</nav>
    <footer>{pt ? "Todos os elementos extraídos. Selecione um nível para explorar." : "Every extracted element. Select a level to explore."}</footer>
  </aside>;
}
