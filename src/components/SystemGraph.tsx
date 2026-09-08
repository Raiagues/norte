import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, Info, Maximize2, Minus, Plus } from "lucide-react";
import type { EngineeringAnalysis, EngineeringEntity, EngineeringRelation, EngineeringSystemModel } from "../lib/engineeringSystem";
import { ENGINEERING_NODE_HEIGHT, ENGINEERING_NODE_WIDTH, engineeringInitialScale, engineeringLabel, engineeringRelationDirectionLabel, formatEngineeringValue, layoutEngineeringGraph } from "../lib/engineeringUi";
import type { Language } from "../lib/types";

type Props = {
  language: Language; model: EngineeringSystemModel; entities: EngineeringEntity[];
  selectedId?: string | null; highlightIds?: Set<string>; highlightRelationIds?: Set<string>; analysis?: EngineeringAnalysis | null;
  onSelect: (entity: EngineeringEntity) => void; onInfo: (entity: EngineeringEntity) => void;
  onDrillDown?: (entity: EngineeringEntity) => void; onWhatIf?: (entity: EngineeringEntity) => void;
  onRelation: (relation: EngineeringRelation) => void;
};

export function SystemGraph({ language, model, entities, selectedId, highlightIds, highlightRelationIds, analysis, onSelect, onInfo, onDrillDown, onWhatIf, onRelation }: Props) {
  const graph = useMemo(() => layoutEngineeringGraph(model, entities, analysis), [model, entities, analysis]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 600 });
  const [navigation, setNavigation] = useState({ scale: 1, x: 0, y: 0, fitted: false });
  const panRef = useRef<{ pointer: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const markerId = useId().replaceAll(":", "");
  const fitScale = engineeringInitialScale(viewport, graph, navigation.fitted, Boolean(analysis));
  const scale = fitScale * navigation.scale;
  const initialFocus = (viewport.width < 600 || analysis) && !navigation.fitted ? graph.nodes.find((node) => node.entity.id === analysis?.changedEntityId) ?? [...graph.nodes].sort((first, second) => first.y - second.y)[0] : undefined;
  const x = (initialFocus ? viewport.width / 2 - (initialFocus.x + ENGINEERING_NODE_WIDTH / 2) * scale : (viewport.width - graph.width * scale) / 2) + navigation.x;
  const y = (initialFocus ? 80 - initialFocus.y * scale : (viewport.height - graph.height * scale) / 2) + navigation.y;
  const statuses = new Map(analysis?.impacts.map((impact) => [impact.entityId, impact]));
  const pt = language === "pt";

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const resize = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function zoom(factor: number) {
    setNavigation((current) => ({ ...current, scale: Math.min(3 / fitScale, Math.max(0.25 / fitScale, current.scale * factor)) }));
  }

  function revealKeyboardFocus(target: HTMLElement, rect: { x: number; y: number; width: number; height: number }) {
    if (!target.matches(":focus-visible") || panRef.current) return;
    const left = x + rect.x * scale; const right = left + rect.width * scale;
    const top = y + rect.y * scale; const bottom = top + rect.height * scale;
    const deltaX = left < 16 ? 16 - left : right > viewport.width - 16 ? viewport.width - 16 - right : 0;
    const deltaY = top < 50 ? 50 - top : bottom > viewport.height - 70 ? viewport.height - 70 - bottom : 0;
    if (deltaX || deltaY) setNavigation((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  }

  return <div className="engineering-graph" ref={viewportRef} aria-label={pt ? "Arquitetura do sistema" : "System architecture"}
    onPointerDown={(event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, [data-graph-control]")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, originX: navigation.x, originY: navigation.y };
    }}
    onPointerMove={(event) => {
      const pan = panRef.current;
      if (pan?.pointer === event.pointerId) setNavigation((current) => ({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
    }}
    onPointerUp={() => { panRef.current = null; }} onPointerCancel={() => { panRef.current = null; }}
    onWheel={(event) => { if (event.ctrlKey || event.metaKey) zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); else setNavigation((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY })); }}>
    <div className="engineering-world" style={{ width: graph.width, height: graph.height, transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
      <svg className="engineering-edges" width={graph.width} height={graph.height} aria-label={pt ? "Relações técnicas" : "Technical relationships"}>
        <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker></defs>
        {graph.containments.map(({ id, points }) => <g className="engineering-edge structural" key={`parent:${id}`}><path d={points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")} /></g>)}
        {graph.edges.map(({ relation, points, reversed }) => {
          const middle = points[Math.floor(points.length / 2)];
          const dim = highlightIds && !(highlightRelationIds?.has(relation.id) || highlightIds.has(relation.from) && highlightIds.has(relation.to));
          const targetStatus = statuses.get(reversed ? relation.from : relation.to)?.status;
          return <g key={relation.id} className={`engineering-edge ${relation.source === "inferred" ? "inferred" : ""} ${dim ? "dimmed" : ""} ${targetStatus ? `status-${targetStatus}` : ""}`}>
            <path d={points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")} markerEnd={`url(#${markerId})`} />
            <foreignObject x={middle.x - 72} y={middle.y - 12} width="144" height="24">
              <button type="button" className="engineering-edge-label" onFocus={(event) => revealKeyboardFocus(event.currentTarget, { x: middle.x - 72, y: middle.y - 12, width: 144, height: 24 })} onClick={() => onRelation(relation)} title={`${engineeringLabel(relation.kind, language)} · ${engineeringLabel(relation.source, language)}`} aria-label={`${pt ? "Inspecionar relação" : "Inspect relationship"}: ${model.entities.find((entity) => entity.id === relation.from)?.name} → ${model.entities.find((entity) => entity.id === relation.to)?.name}, ${engineeringLabel(relation.kind, language)}`}>
                {engineeringRelationDirectionLabel(relation.kind, reversed, language)}{relation.source === "inferred" ? " · ?" : ""}
              </button>
            </foreignObject>
          </g>;
        })}
      </svg>
      {graph.nodes.map(({ entity, x: nodeX, y: nodeY }) => {
        const impact = statuses.get(entity.id);
        const changed = entity.id === analysis?.changedEntityId;
        const properties = entity.properties.filter((property) => property.key !== "formula").sort((first, second) => changed ? Number(analysis.change.newValues.some((property) => property.key === second.key)) - Number(analysis.change.newValues.some((property) => property.key === first.key)) : Number(second.source === "calculated") - Number(first.source === "calculated"));
        const childCount = new Set([...model.entities.filter((child) => child.parentId === entity.id).map((child) => child.id), ...model.relations.filter((relation) => relation.kind === "contains" && relation.from === entity.id).map((relation) => relation.to)]).size;
        const hasChildren = childCount > 0;
        const name = changed && analysis.change.replacementName ? analysis.change.replacementName : entity.name;
        return <article className={`engineering-node ${selectedId === entity.id ? "selected" : ""} ${impact ? `status-${impact.status}` : ""} ${highlightIds && !highlightIds.has(entity.id) ? "dimmed" : ""}`} key={entity.id} style={{ left: nodeX, top: nodeY, width: ENGINEERING_NODE_WIDTH, height: ENGINEERING_NODE_HEIGHT }} data-entity-id={entity.id} onFocusCapture={(event) => revealKeyboardFocus(event.target as HTMLElement, { x: nodeX, y: nodeY, width: ENGINEERING_NODE_WIDTH, height: ENGINEERING_NODE_HEIGHT + (onWhatIf && selectedId === entity.id ? 40 : 0) })}>
          <button className="engineering-node-main" type="button" aria-pressed={selectedId === entity.id} onClick={() => { onSelect(entity); if (entity.kind === "subsystem" && hasChildren) onDrillDown?.(entity); }}>
            <span className="engineering-node-kind">{engineeringLabel(entity.kind, language)}{impact && <em>{engineeringLabel(impact.status, language)}</em>}</span>
            <strong>{name}</strong>
            <span className="engineering-node-values">{properties.slice(0, impact?.calculation ? 1 : 2).map((property) => <span key={property.key} title={`${property.name}: ${formatEngineeringValue(property)}`}>{!property.unit && typeof property.value === "number" ? `${property.name}: ` : ""}{formatEngineeringValue({ ...property, value: typeof property.value === "number" ? Number(property.value.toPrecision(5)) : property.value })}</span>)}{!properties.length && hasChildren && <span>{childCount} {pt ? childCount === 1 ? "elemento" : "elementos" : childCount === 1 ? "element" : "elements"}<ChevronRight aria-hidden="true" /></span>}{!properties.length && !hasChildren && <span>{entity.properties.some((property) => property.key === "formula") ? pt ? "Cálculo a avaliar" : "Calculation to evaluate" : pt ? "Dados a confirmar" : "Data to confirm"}</span>}</span>
            {impact?.calculation && <span className="engineering-node-equation" title={impact.calculation.expression}>{impact.calculation.expression}</span>}
          </button>
          <button type="button" className="engineering-node-info" aria-label={`${pt ? "Informações de" : "Information about"} ${entity.name}`} onClick={() => onInfo(entity)}><Info aria-hidden="true" /></button>
          {selectedId === entity.id && onWhatIf && <button type="button" className="engineering-node-whatif" onClick={() => onWhatIf(entity)}>{pt ? "E se…" : "What if…"}</button>}
        </article>;
      })}
    </div>
    {!entities.length && <div className="engineering-graph-empty">{pt ? "Nenhuma entidade vinculada a este recorte." : "No entities are linked to this view."}</div>}
    <div className="engineering-navigation" data-graph-control role="group" aria-label={pt ? "Navegação do grafo" : "Graph navigation"}>
      <button type="button" aria-label={pt ? "Afastar" : "Zoom out"} onClick={() => zoom(1 / 1.2)}><Minus aria-hidden="true" /></button>
      <output>{Math.round(scale * 100)}%</output>
      <button type="button" aria-label={pt ? "Aproximar" : "Zoom in"} onClick={() => zoom(1.2)}><Plus aria-hidden="true" /></button>
      <button type="button" aria-label={pt ? "Enquadrar sistema" : "Fit system"} onClick={() => setNavigation({ scale: 1, x: 0, y: 0, fitted: true })}><Maximize2 aria-hidden="true" /></button>
    </div>
    {analysis && <div className="engineering-legend" aria-label={pt ? "Legenda de impacto" : "Impact legend"}>{["changed", "valid", "review", "critical"].map((status) => <span key={status} className={`status-${status}`}><i />{engineeringLabel(status, language)}</span>)}</div>}
  </div>;
}
