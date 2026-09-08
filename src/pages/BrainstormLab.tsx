import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Link2, Pencil, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { createLabLink, createLabNode, LAB_NODE_WIDTH, LAB_NODE_HEIGHT, LAB_WORLD_HEIGHT, LAB_WORLD_WIDTH, loadLabBoard, normalizeLabBoard, saveLabBoard } from "../lib/brainstormLab";
import type { LabBoard, LabNode } from "../lib/brainstormLab";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import type { EngineeringAnalysis } from "../lib/engineeringSystem";
import { changeFromHypothesis, recognizeEngineeringHypothesis } from "../lib/discoveryEngineering";
import { analyzeImpact } from "../lib/impactEngine";
import type { DiscoveryHypothesis } from "../lib/discoveryEngineering";
import { EngineeringScenario, EngineeringWhatIf } from "./SystemWorkspace";

type Props = { language: Language; project: MissionProject; onProjectChange: (project: MissionProject) => void };
type Transform = { scale: number; x: number; y: number };
type Composer = { x: number; y: number; text: string; nodeId?: string };
type Gesture = { kind: "pan" | "node"; pointerId: number; startX: number; startY: number; x: number; y: number; nodeId?: string; before: LabBoard; moved: boolean };
const PROMPTS = { pt: ["Clique para explorar uma hipótese.", "E se mudássemos alguma coisa?"], en: ["Click to explore a hypothesis.", "What if we changed something?"] };

export function BrainstormLab({ language, project, onProjectChange }: Props) {
  const auth = useAuth();
  const [board, setBoard] = useState(() => loadLabBoard(project.id));
  const boardRef = useRef(board);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const historyRef = useRef<{ past: LabBoard[]; future: LabBoard[] }>({ past: [], future: [] });
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [ready, setReady] = useState(false);
  const remoteReadyRef = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [hypothesis, setHypothesis] = useState<DiscoveryHypothesis | null>(null);
  const [scenario, setScenario] = useState<EngineeringAnalysis | null>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [panning, setPanning] = useState(false);
  const prompt = useAnimatedPrompt(PROMPTS[language]);
  const copy = language === "pt" ? { add: "Nova ideia", edit: "Editar ideia", remove: "Excluir ideia", connect: "Conectar ideia", undo: "Desfazer", redo: "Refazer", fit: "Enquadrar ideias", in: "Aumentar zoom", out: "Diminuir zoom", placeholder: "Escreva uma hipótese…", impact: "Ver impacto", save: "Salvar", cancel: "Cancelar", idea: "HIPÓTESE", sync: "Não foi possível sincronizar. As ideias estão salvas neste navegador." } : { add: "New idea", edit: "Edit idea", remove: "Delete idea", connect: "Connect idea", undo: "Undo", redo: "Redo", fit: "Fit ideas", in: "Zoom in", out: "Zoom out", placeholder: "Write a hypothesis…", impact: "See impact", save: "Save", cancel: "Cancel", idea: "HYPOTHESIS", sync: "Could not sync. Ideas are saved in this browser." };
  const syncMessageRef = useRef(copy.sync);
  syncMessageRef.current = copy.sync;

  const update = useCallback((next: LabBoard) => { boardRef.current = next; setBoard(next); saveLabBoard(project.id, next); }, [project.id]);
  function updateHistory() { setHistory({ undo: historyRef.current.past.length > 0, redo: historyRef.current.future.length > 0 }); }
  function commit(next: LabBoard, before = boardRef.current) {
    historyRef.current = { past: [...historyRef.current.past, structuredClone(before)].slice(-60), future: [] };
    updateHistory(); update(next);
  }
  function undo() {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(structuredClone(boardRef.current));
    update(previous); updateHistory(); setSelected(null);
  }
  function redo() {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(structuredClone(boardRef.current));
    update(next); updateHistory(); setSelected(null);
  }
  function remove(id: string) { commit({ ...boardRef.current, nodes: boardRef.current.nodes.filter((node) => node.id !== id), links: boardRef.current.links.filter((link) => link.from !== id && link.to !== id) }); setSelected(null); setComposer(null); }
  function showImpact(suggestion: DiscoveryHypothesis, text: string) {
    const model = project.engineeringSystem;
    if (!model) return;
    const change = changeFromHypothesis(suggestion, model, text);
    if (!change) { setHypothesis(suggestion); return; }
    try { setScenario(analyzeImpact(model, change, language)); setComposer(null); }
    catch { setFeedback(language === "pt" ? "Revise o valor e a unidade desta hipótese." : "Review this hypothesis value and unit."); }
  }
  function fit() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !boardRef.current.nodes.length) return;
    const nodes = boardRef.current.nodes;
    const minX = Math.min(...nodes.map((node) => node.x)), minY = Math.min(...nodes.map((node) => node.y));
    const width = Math.max(...nodes.map((node) => node.x + LAB_NODE_WIDTH)) - minX;
    const height = Math.max(...nodes.map((node) => node.y + LAB_NODE_HEIGHT)) - minY;
    const scale = Math.max(.2, Math.min(1, (rect.width - 100) / width, (rect.height - 120) / height));
    setTransform({ scale, x: (rect.width - width * scale) / 2 - minX * scale, y: (rect.height - height * scale) / 2 - minY * scale });
  }
  function zoom(factor: number, anchor?: { x: number; y: number }) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = anchor ?? { x: rect.width / 2, y: rect.height / 2 };
    setTransform((current) => {
      const scale = Math.max(.2, Math.min(2, current.scale * factor));
      return { scale, x: point.x - (point.x - current.x) * scale / current.scale, y: point.y - (point.y - current.y) * scale / current.scale };
    });
  }
  function openComposer(point?: { x: number; y: number }, node?: LabNode) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const center = point ?? { x: (rect?.width ?? 800) / 2, y: (rect?.height ?? 500) / 2 };
    setComposer(node ? { x: node.x, y: node.y, text: node.text, nodeId: node.id } : { x: (center.x - transform.x) / transform.scale, y: (center.y - transform.y) / transform.scale, text: "" });
    setConnecting(null);
  }
  function saveIdea() {
    if (!composer?.text.trim()) return;
    const text = composer.text.trim().slice(0, 220);
    if (composer.nodeId) {
      commit({ ...boardRef.current, nodes: boardRef.current.nodes.map((node) => node.id === composer.nodeId ? { ...node, text } : node) }); setComposer(null);
    } else {
      const node = createLabNode(text, composer.x, composer.y);
      commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, node] });
      setComposer({ x: composer.x, y: composer.y + LAB_NODE_HEIGHT + 30, text: "" });
      setSelected(node.id);
    }
  }
  function selectNode(node: LabNode) {
    if (connecting && connecting !== node.id) {
      const current = boardRef.current;
      if (!current.links.some((link) => link.from === connecting && link.to === node.id)) commit({ ...current, links: [...current.links, createLabLink(connecting, node.id)] });
      setConnecting(null);
    }
    setSelected(node.id);
  }
  function pointerDown(event: React.PointerEvent, node?: LabNode) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,textarea,[data-control]")) return;
    event.stopPropagation();
    if (node) selectNode(node); else { setSelected(null); setConnecting(null); }
    gestureRef.current = { kind: node ? "node" : "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node?.x ?? transform.x, y: node?.y ?? transform.y, nodeId: node?.id, before: structuredClone(boardRef.current), moved: false };
    viewportRef.current?.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) < 4 && !gesture.moved) return;
    gesture.moved = true;
    if (gesture.kind === "pan") { setPanning(true); setTransform((current) => ({ ...current, x: gesture.x + dx, y: gesture.y + dy })); }
    else update({ ...boardRef.current, nodes: boardRef.current.nodes.map((node) => node.id === gesture.nodeId ? { ...node, x: gesture.x + dx / transform.scale, y: gesture.y + dy / transform.scale, pinned: true } : node) });
  }
  function pointerUp(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null; setPanning(false);
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) viewportRef.current.releasePointerCapture(event.pointerId);
    if (gesture.kind === "node" && gesture.moved) commit(boardRef.current, gesture.before);
    if (gesture.kind === "pan" && !gesture.moved && event.type !== "pointercancel") {
      if (composer) { setComposer(null); return; }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) openComposer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
  }

  useEffect(() => { setToolbarTarget(document.getElementById("brainstorm-lab-toolbar")); }, []);
  useEffect(() => { if (composer) textareaRef.current?.focus(); }, [composer?.nodeId, Boolean(composer)]);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    remoteReadyRef.current = false;
    void auth.api<{ board: LabBoard | null }>(`/workspace/labs/${encodeURIComponent(project.id)}`).then(({ board: remote }) => {
      if (!cancelled && remote) update(normalizeLabBoard(remote));
    }).catch(() => { if (!cancelled) setFeedback(syncMessageRef.current); }).finally(() => { if (!cancelled) { remoteReadyRef.current = true; setReady(true); } });
    return () => { cancelled = true; };
  }, [auth.api, project.id, update]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void auth.api(`/workspace/labs/${encodeURIComponent(project.id)}`, { method: "PUT", body: JSON.stringify(board) }).then(() => setFeedback("")).catch(() => setFeedback(syncMessageRef.current));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [auth.api, board, project.id, ready]);
  useEffect(() => {
    const flush = () => {
      if (!remoteReadyRef.current) return;
      saveLabBoard(project.id, boardRef.current);
      void auth.api(`/workspace/labs/${encodeURIComponent(project.id)}`, { method: "PUT", body: JSON.stringify(boardRef.current), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [auth.api, project.id]);
  useEffect(() => { if (ready) fit(); }, [ready]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (hypothesis || scenario || (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true]"))) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if (command && event.key.toLowerCase() === "n") { event.preventDefault(); openComposer(); }
      else if (selected && ["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); remove(selected); }
      else if (event.key === "Escape") { setComposer(null); setConnecting(null); setSelected(null); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  return <div className="brainstorm-lab quiet-discovery">
    {toolbarTarget && !scenario && createPortal(<button className="primary" type="button" onClick={() => openComposer()} disabled={!ready}><Plus aria-hidden="true" />{copy.add}</button>, toolbarTarget)}
    {scenario && project.engineeringSystem ? <EngineeringScenario language={language} model={project.engineeringSystem} analysis={scenario} onClear={() => setScenario(null)} saved={project.engineeringSystem.scenarios?.some((item) => item.id === scenario.id)} onSave={() => onProjectChange({ ...project, engineeringSystem: { ...project.engineeringSystem!, scenarios: [...(project.engineeringSystem?.scenarios ?? []).filter((item) => item.id !== scenario.id), scenario] } })} /> : <div ref={viewportRef} className={`lab-canvas${panning ? " panning" : ""}`} onPointerDown={(event) => { if (ready) pointerDown(event); }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(event) => {
      if ((event.target as HTMLElement).closest("textarea")) return;
      const rect = event.currentTarget.getBoundingClientRect(); zoom(event.deltaY < 0 ? 1.08 : 1 / 1.08, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }}>
      {!board.nodes.length && !composer && <button className="lab-empty-prompt" data-control type="button" onClick={() => openComposer()} disabled={!ready} aria-label={copy.add}><span className="lab-empty-plus" aria-hidden="true">+</span><strong>{prompt}<i aria-hidden="true" /></strong></button>}
      <div className="lab-world" style={{ width: LAB_WORLD_WIDTH, height: LAB_WORLD_HEIGHT, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
        <svg className="lab-relations" width={LAB_WORLD_WIDTH} height={LAB_WORLD_HEIGHT} aria-hidden="true"><defs><marker id="discovery-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="#6c9dbc" /></marker></defs>{board.links.map((link) => {
          const from = board.nodes.find((node) => node.id === link.from), to = board.nodes.find((node) => node.id === link.to);
          if (!from || !to) return null;
          return <path key={link.id} className="lab-relation confirmed" d={`M${from.x + LAB_NODE_WIDTH / 2},${from.y + LAB_NODE_HEIGHT} C${from.x + LAB_NODE_WIDTH / 2},${from.y + LAB_NODE_HEIGHT + 35} ${to.x + LAB_NODE_WIDTH / 2},${to.y - 35} ${to.x + LAB_NODE_WIDTH / 2},${to.y}`} markerEnd="url(#discovery-arrow)" />;
        })}</svg>
        {board.nodes.map((node) => {
          const suggestion = recognizeEngineeringHypothesis(node.text, project.engineeringSystem);
          return <article className={`lab-node${selected === node.id ? " selected" : ""}`} style={{ left: node.x, top: node.y, width: LAB_NODE_WIDTH, minHeight: LAB_NODE_HEIGHT }} key={node.id} data-node-id={node.id} onPointerDown={(event) => pointerDown(event, node)} onDoubleClick={() => openComposer(undefined, node)}>
            <div className="lab-node-head"><span>{copy.idea}</span><button type="button" title={copy.edit} aria-label={`${copy.edit}: ${node.text}`} onClick={() => openComposer(undefined, node)}><Pencil aria-hidden="true" /></button></div>
            <button className="discovery-node-text" type="button" onClick={() => selectNode(node)} onDoubleClick={() => openComposer(undefined, node)}>{node.text}</button>
            {suggestion && <button className="discovery-impact-action" type="button" onClick={() => showImpact(suggestion, node.text)}><ArrowRight aria-hidden="true" />{copy.impact}</button>}
            {selected === node.id && <div className="discovery-node-actions" data-control><button type="button" aria-label={copy.connect} title={copy.connect} aria-pressed={connecting === node.id} onClick={() => setConnecting(connecting === node.id ? null : node.id)}><Link2 aria-hidden="true" /></button><button type="button" aria-label={copy.remove} title={copy.remove} onClick={() => remove(node.id)}><Trash2 aria-hidden="true" /></button></div>}
          </article>;
        })}
        {composer && <form className="lab-composer" data-control style={{ left: composer.x, top: composer.y, width: LAB_NODE_WIDTH }} onSubmit={(event) => { event.preventDefault(); saveIdea(); }}><textarea ref={textareaRef} value={composer.text} maxLength={220} placeholder={copy.placeholder} aria-label={copy.placeholder} onChange={(event) => setComposer({ ...composer, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveIdea(); } if (event.key === "Escape") setComposer(null); }} /><button type="submit" aria-label={copy.save}><Plus aria-hidden="true" /></button><button type="button" onClick={() => setComposer(null)} aria-label={copy.cancel}>×</button></form>}
      </div>
      {feedback && <div className="discovery-notice" role="status">{feedback}</div>}
      {connecting && <div className="discovery-notice">{language === "pt" ? "Selecione a outra ideia para conectar." : "Select the other idea to connect."}<button type="button" onClick={() => setConnecting(null)}>{copy.cancel}</button></div>}
      <div className="discovery-navigation" data-control><button type="button" aria-label={copy.undo} title={`${copy.undo} · Ctrl+Z`} disabled={!history.undo} onClick={undo}><Undo2 aria-hidden="true" /></button><button type="button" aria-label={copy.redo} title={`${copy.redo} · Ctrl+Shift+Z`} disabled={!history.redo} onClick={redo}><Redo2 aria-hidden="true" /></button><span /><button type="button" aria-label={copy.out} onClick={() => zoom(1 / 1.15)}>−</button><output>{Math.round(transform.scale * 100)}%</output><button type="button" aria-label={copy.in} onClick={() => zoom(1.15)}>+</button><button type="button" aria-label={copy.fit} title={copy.fit} onClick={fit}>⌂</button></div>
    </div>}
    {hypothesis && <EngineeringWhatIf language={language} project={project} suggestion={hypothesis} targetEntityId={hypothesis.targetEntityId} onClose={() => setHypothesis(null)} onAnalyzed={(analysis) => { setScenario(analysis); setHypothesis(null); setComposer(null); }} />}
  </div>;
}

function useAnimatedPrompt(phrases: readonly string[]): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setText(phrases[0]); return; }
    let index = 0, character = 0, deleting = false, timeout = 0;
    const tick = () => {
      character += deleting ? -1 : 1;
      setText(phrases[index].slice(0, character));
      if (character === phrases[index].length) { deleting = true; timeout = window.setTimeout(tick, 2400); return; }
      if (!character) { deleting = false; index = (index + 1) % phrases.length; }
      timeout = window.setTimeout(tick, deleting ? 28 : 55);
    };
    timeout = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timeout);
  }, [phrases]);
  return text;
}
