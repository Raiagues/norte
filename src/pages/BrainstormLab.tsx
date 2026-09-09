import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Link2, Pencil, Plus, Redo2, Trash2, Undo2, Copy, LoaderCircle, Check, Maximize2, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { createLabLink, createLabNode, LAB_NODE_WIDTH, LAB_NODE_HEIGHT, LAB_WORLD_HEIGHT, LAB_WORLD_WIDTH, loadLabBoard, normalizeLabBoard, saveLabBoard } from "../lib/brainstormLab";
import type { LabBoard, LabNode } from "../lib/brainstormLab";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import type { EngineeringAnalysis, EngineeringChange } from "../lib/engineeringSystem";
import { analyzeImpact } from "../lib/impactEngine";
import { engineeringLabel, projectEngineeringScenario } from "../lib/engineeringUi";
import { EngineeringScenario } from "./SystemWorkspace";

const SUGGESTION_WIDTH = 250, SUGGESTION_GAP = 14, SUGGESTION_OFFSET = 96;

type Interpretation = { text: string; status: "loading" | "resolved" | "confirmation" | "clarification" | "error"; summary?: string; question?: string; change?: EngineeringChange; baselineId?: string; baselineRevision?: number; baselineGeneratedAt?: string };
/** An impact reading anchored to the idea that produced it, still only a proposal. */
type Proposal = { nodeId: string; analysis: EngineeringAnalysis };
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
  const [interpretations, setInterpretations] = useState<Record<string, Interpretation>>({});
  const interpretationRequests = useRef(new Map<string, AbortController>());
  const projectRef = useRef(project); projectRef.current = project;
  const [scenario, setScenario] = useState<EngineeringAnalysis | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const framedRef = useRef<string | null>(null);
  const [panning, setPanning] = useState(false);
  const prompt = useAnimatedPrompt(PROMPTS[language]);
  const copy = language === "pt" ? { add: "Nova ideia", edit: "Editar ideia", remove: "Excluir ideia", connect: "Conectar ideia", undo: "Desfazer", redo: "Refazer", fit: "Enquadrar ideias", in: "Aumentar zoom", out: "Diminuir zoom", placeholder: "Escreva uma hipótese…", impact: "Ver impacto", save: "Salvar", cancel: "Cancelar", idea: "HIPÓTESE", sync: "Não foi possível sincronizar. As ideias estão salvas neste navegador.", yes: "Sim, ver impacto", no: "Não, ajustar", accept: "Aplicar ao sistema", dismiss: "Descartar sugestões", full: "Abrir mapa completo", suggestions: "SUGESTÃO", noImpact: "Nada mais no sistema depende desta mudança." } : { add: "New idea", edit: "Edit idea", remove: "Delete idea", connect: "Connect idea", undo: "Undo", redo: "Redo", fit: "Fit ideas", in: "Zoom in", out: "Zoom out", placeholder: "Write a hypothesis…", impact: "See impact", save: "Save", cancel: "Cancel", idea: "HYPOTHESIS", sync: "Could not sync. Ideas are saved in this browser.", yes: "Yes, see impact", no: "No, adjust", accept: "Apply to system", dismiss: "Dismiss suggestions", full: "Open full map", suggestions: "SUGGESTION", noImpact: "Nothing else in the system depends on this change." };
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
  function openImpact(change: EngineeringChange, nodeId: string) {
    const model = projectRef.current.engineeringSystem;
    if (!model) return;
    try { setProposal({ nodeId, analysis: analyzeImpact(model, change, language) }); setComposer(null); setFeedback(""); }
    catch { setFeedback(language === "pt" ? "Não foi possível avaliar esta hipótese. Revise a ideia no cartão." : "Could not evaluate this hypothesis. Refine the idea on the card."); }
  }
  /** Accepting writes the proposal into the architecture; until then nothing moved. */
  function acceptProposal() {
    const model = projectRef.current.engineeringSystem;
    if (!proposal || !model) return;
    // Accepting edits the architecture exactly as a manual correction does, so
    // the baseline identity the interpreter checks against stays valid.
    onProjectChange({ ...projectRef.current, engineeringSystem: projectEngineeringScenario(model, proposal.analysis) });
    setProposal(null); setScenario(null);
    setFeedback(language === "pt" ? "Sugestão aplicada à arquitetura." : "Suggestion applied to the architecture.");
  }
  async function interpret(node: LabNode, showResult = false) {
    if (!projectRef.current.engineeringSystem) return;
    interpretationRequests.current.get(node.id)?.abort();
    const controller = new AbortController(); interpretationRequests.current.set(node.id, controller);
    setInterpretations((current) => ({ ...current, [node.id]: { text: node.text, status: "loading" } }));
    try {
      if (auth.isDemo) throw new Error(language === "pt" ? "A interpretação por IA está disponível no ambiente conectado." : "AI interpretation is available in the connected workspace.");
      const response = await auth.api<Omit<Interpretation, "text">>("/system-ai/interpret-hypothesis", { method: "POST", body: JSON.stringify({ projectId: project.id, text: node.text, language }), signal: controller.signal });
      if (controller.signal.aborted || boardRef.current.nodes.find((item) => item.id === node.id)?.text !== node.text) return;
      const model = projectRef.current.engineeringSystem;
      if (response.baselineId !== model?.id || response.baselineRevision !== (model?.revision || 0) || response.baselineGeneratedAt !== model?.generatedAt) throw new Error(language === "pt" ? "O sistema mudou. Interprete esta ideia novamente." : "The system changed. Interpret this idea again.");
      setInterpretations((current) => ({ ...current, [node.id]: { ...response, text: node.text } }));
      if (showResult && ["resolved", "confirmation"].includes(response.status) && response.change) openImpact(response.change, node.id);
    } catch (error) {
      if (!controller.signal.aborted && boardRef.current.nodes.find((item) => item.id === node.id)?.text === node.text) setInterpretations((current) => ({ ...current, [node.id]: { text: node.text, status: "error", question: error instanceof Error && "code" in error && ["SYSTEM_AI_UNAVAILABLE", "SYSTEM_AI_NOT_CONFIGURED"].includes(String(error.code)) ? language === "pt" ? "A IA não respondeu agora. Sua ideia está salva; tente novamente." : "AI could not respond. Your idea is saved; try again." : error instanceof Error ? error.message : language === "pt" ? "Não foi possível interpretar a ideia. Tente novamente." : "Could not interpret the idea. Try again." } }));
    } finally { if (interpretationRequests.current.get(node.id) === controller) interpretationRequests.current.delete(node.id); }
  }
  function showImpact(node: LabNode) {
    const result = interpretations[node.id], model = project.engineeringSystem;
    if (result?.text === node.text && ["resolved", "confirmation"].includes(result.status) && result.change && result.baselineId === model?.id && result.baselineRevision === (model?.revision || 0) && result.baselineGeneratedAt === model?.generatedAt) openImpact(result.change, node.id);
    else void interpret(node, true);
  }
  useEffect(() => () => { interpretationRequests.current.forEach((controller) => controller.abort()); }, []);
  useEffect(() => {
    if (proposal && !board.nodes.some((node) => node.id === proposal.nodeId)) setProposal(null);
  }, [board.nodes, proposal]);
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
  function freePosition(origin: { x: number; y: number }) {
    const nodes = boardRef.current.nodes;
    for (let step = 0; step <= nodes.length; step++) {
      const position = { x: origin.x + (step % 3) * (LAB_NODE_WIDTH + 40), y: origin.y + Math.floor(step / 3) * (LAB_NODE_HEIGHT + 50) };
      if (!nodes.some((node) => Math.abs(node.x - position.x) < LAB_NODE_WIDTH + 20 && Math.abs(node.y - position.y) < LAB_NODE_HEIGHT + 30)) return position;
    }
    return { x: origin.x, y: Math.max(...nodes.map((node) => node.y)) + LAB_NODE_HEIGHT + 50 };
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
      const edited = boardRef.current.nodes.find((node) => node.id === composer.nodeId); if (edited) void interpret(edited);
    } else {
      const position = freePosition(composer);
      const node = createLabNode(text, position.x, position.y);
      commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, node] });
      setComposer({ x: composer.x, y: composer.y + LAB_NODE_HEIGHT + 30, text: "" });
      setSelected(node.id); fit(); void interpret(node);
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
    if (event.button !== 0 || (event.target as HTMLElement).closest("textarea,[data-control]") || (event.target as HTMLElement).closest("button:not(.discovery-node-text)")) return;
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
      if (scenario || (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true]"))) return;
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

  const suggestions = (() => {
    const model = project.engineeringSystem;
    const anchor = proposal && board.nodes.find((node) => node.id === proposal.nodeId);
    if (!proposal || !anchor || !model) return null;
    const pt = language === "pt";
    const blocks = proposal.analysis.impacts
      .filter((impact) => impact.status !== "unaffected")
      .map((impact) => {
        const entity = model.entities.find((item) => item.id === impact.entityId) ?? model.requirements.find((item) => item.id === impact.entityId);
        const explanation = impact.shortExplanation || (pt ? "Sem explicação registrada." : "No recorded explanation.");
        const calculation = impact.calculation;
        return {
          entityId: impact.entityId, status: impact.status,
          name: (entity && ("name" in entity ? entity.name : entity.title)) || impact.entityId,
          explanation, value: calculation && typeof calculation.result === "number" ? `${Number(calculation.result.toPrecision(5))} ${calculation.unit}`.trim() : "",
          height: 96 + Math.min(3, Math.ceil(explanation.length / 38)) * 16
        };
      });
    if (!blocks.length) blocks.push({ entityId: "none", status: "valid" as const, name: proposal.analysis.change.description, explanation: copy.noImpact, value: "", height: 118 });
    const height = blocks.reduce((total, block) => total + block.height + SUGGESTION_GAP, -SUGGESTION_GAP);
    return { blocks, analysis: proposal.analysis, height, x: anchor.x + LAB_NODE_WIDTH + SUGGESTION_OFFSET, y: anchor.y + LAB_NODE_HEIGHT / 2 - height / 2 };
  })();

  // An impact the user cannot see is not an answer: frame the idea with its flow.
  useEffect(() => {
    if (!proposal || !suggestions) { framedRef.current = null; return; }
    if (framedRef.current === proposal.analysis.id) return;
    const anchor = boardRef.current.nodes.find((node) => node.id === proposal.nodeId);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!anchor || !rect) return;
    framedRef.current = proposal.analysis.id;
    const left = anchor.x, top = Math.min(anchor.y, suggestions.y);
    const width = suggestions.x + SUGGESTION_WIDTH - left;
    const height = Math.max(anchor.y + LAB_NODE_HEIGHT, suggestions.y + suggestions.height + 130) - top;
    const scale = Math.max(.3, Math.min(1, (rect.width - 130) / width, (rect.height - 150) / height));
    setTransform({ scale, x: (rect.width - width * scale) / 2 - left * scale, y: (rect.height - height * scale) / 2 - top * scale });
  }, [proposal, suggestions]);

  return <div className="brainstorm-lab quiet-discovery">
    {!scenario && <div className="discovery-tools" role="toolbar" aria-label={language === "pt" ? "Ferramentas do Discovery" : "Discovery tools"}>
      <button className="primary" type="button" onClick={() => openComposer()} disabled={!ready}><Plus />{copy.add}</button>
      {selected && <><span />
      <button type="button" disabled={!selected} onClick={() => setConnecting(connecting ? null : selected)} aria-pressed={Boolean(connecting)}><Link2 />{language === "pt" ? "Conectar" : "Connect"}</button>
      <button type="button" disabled={!selected} onClick={() => { const original = boardRef.current.nodes.find((node) => node.id === selected); if (original) { const position = freePosition({ x: original.x + LAB_NODE_WIDTH + 40, y: original.y }); const node = createLabNode(original.text, position.x, position.y); commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, node] }); setSelected(node.id); fit(); } }}><Copy />{language === "pt" ? "Duplicar" : "Duplicate"}</button>
      <button type="button" disabled={!selected} onClick={() => { if (selected) remove(selected); }}><Trash2 />{language === "pt" ? "Excluir" : "Delete"}</button></>}
    </div>}
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
        })}{suggestions && (() => {
          const anchor = board.nodes.find((node) => node.id === proposal?.nodeId)!;
          const from = { x: anchor.x + LAB_NODE_WIDTH, y: anchor.y + LAB_NODE_HEIGHT / 2 };
          return suggestions.blocks.map((block, index) => {
            const to = { x: suggestions.x, y: suggestions.y + index * (block.height + SUGGESTION_GAP) + block.height / 2 };
            return <path key={`suggestion:${block.entityId}`} className="lab-relation suggestion" d={`M${from.x},${from.y} C${from.x + 50},${from.y} ${to.x - 50},${to.y} ${to.x},${to.y}`} markerEnd="url(#discovery-arrow)" />;
          });
        })()}</svg>
        {board.nodes.map((node) => {
          const interpretation = interpretations[node.id]?.text === node.text ? interpretations[node.id] : undefined;
          return <article className={`lab-node${selected === node.id ? " selected" : ""}`} style={{ left: node.x, top: node.y, width: LAB_NODE_WIDTH, minHeight: LAB_NODE_HEIGHT }} key={node.id} data-node-id={node.id} onPointerDown={(event) => pointerDown(event, node)} onDoubleClick={() => openComposer(undefined, node)}>
            <div className="lab-node-head"><span>{copy.idea}</span><button type="button" title={copy.edit} aria-label={`${copy.edit}: ${node.text}`} onClick={() => openComposer(undefined, node)}><Pencil aria-hidden="true" /></button></div>
            <button className="discovery-node-text" type="button" onClick={() => selectNode(node)} onDoubleClick={() => openComposer(undefined, node)}>{node.text}</button>
            {interpretation && <p className={`discovery-interpretation ${interpretation.status}`} aria-live="polite">{interpretation.status === "loading" ? <><LoaderCircle className="engineering-spin" />{language === "pt" ? "Interpretando a ideia…" : "Interpreting the idea…"}</> : interpretation.summary || interpretation.question}</p>}
            {interpretation?.status === "confirmation" && interpretation.question && <p className="discovery-interpretation question">{interpretation.question}</p>}
            {interpretation?.status === "clarification" ? <button className="discovery-impact-action" type="button" onClick={() => openComposer(undefined, node)}><Pencil />{language === "pt" ? "Completar ideia" : "Refine idea"}</button>
              : interpretation?.status === "confirmation" ? <div className="discovery-confirm">
                <button className="discovery-impact-action primary" type="button" onClick={() => showImpact(node)}><Check />{copy.yes}</button>
                <button className="discovery-impact-action" type="button" onClick={() => openComposer(undefined, node)}><Pencil />{copy.no}</button>
              </div>
              : <button className="discovery-impact-action" type="button" disabled={!project.engineeringSystem || interpretation?.status === "loading"} onClick={() => showImpact(node)}><ArrowRight />{interpretation?.status === "error" ? language === "pt" ? "Tentar novamente" : "Try again" : copy.impact}</button>}
          </article>;
        })}
        {suggestions && <>
          {suggestions.blocks.map((block, index) => <article className={`discovery-suggestion status-${block.status}`} key={block.entityId} style={{ left: suggestions.x, top: suggestions.y + index * (block.height + SUGGESTION_GAP), width: SUGGESTION_WIDTH }} data-control>
            <span className="discovery-suggestion-head">{copy.suggestions}<em>{engineeringLabel(block.status, language)}</em></span>
            <strong>{block.name}</strong>
            <p>{block.explanation}</p>
            {block.value && <span className="discovery-suggestion-value">{block.value}</span>}
          </article>)}
          <div className="discovery-suggestion-actions" data-control style={{ left: suggestions.x, top: suggestions.y + suggestions.height + SUGGESTION_GAP, width: SUGGESTION_WIDTH }}>
            <button type="button" className="primary" onClick={acceptProposal}><Check />{copy.accept}</button>
            <button type="button" onClick={() => setScenario(suggestions.analysis)}><Maximize2 />{copy.full}</button>
            <button type="button" onClick={() => setProposal(null)}><X />{copy.dismiss}</button>
          </div>
        </>}
        {composer && <form className="lab-composer" data-control style={{ left: composer.x, top: composer.y, width: LAB_NODE_WIDTH }} onSubmit={(event) => { event.preventDefault(); saveIdea(); }}><textarea ref={textareaRef} value={composer.text} maxLength={220} placeholder={copy.placeholder} aria-label={copy.placeholder} onChange={(event) => setComposer({ ...composer, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveIdea(); } if (event.key === "Escape") setComposer(null); }} /><button type="submit" aria-label={copy.save}><Plus aria-hidden="true" /></button><button type="button" onClick={() => setComposer(null)} aria-label={copy.cancel}>×</button></form>}
      </div>
      {feedback && <div className="discovery-notice" role="status">{feedback}</div>}
      {connecting && <div className="discovery-notice">{language === "pt" ? "Selecione a outra ideia para conectar." : "Select the other idea to connect."}<button type="button" onClick={() => setConnecting(null)}>{copy.cancel}</button></div>}
      <div className="discovery-navigation" data-control><button type="button" aria-label={copy.undo} title={`${copy.undo} · Ctrl+Z`} disabled={!history.undo} onClick={undo}><Undo2 aria-hidden="true" /></button><button type="button" aria-label={copy.redo} title={`${copy.redo} · Ctrl+Shift+Z`} disabled={!history.redo} onClick={redo}><Redo2 aria-hidden="true" /></button><span /><button type="button" aria-label={copy.out} onClick={() => zoom(1 / 1.15)}>−</button><output>{Math.round(transform.scale * 100)}%</output><button type="button" aria-label={copy.in} onClick={() => zoom(1.15)}>+</button><button type="button" aria-label={copy.fit} title={copy.fit} onClick={fit}>⌂</button></div>
    </div>}
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
