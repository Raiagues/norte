import { useCallback, useEffect, useRef, useState } from "react";
import { Code2, FolderGit2, Cpu, RadioTower, Link2 } from "lucide-react";
import { ProjectAreaShell, AreaPreviewNote } from "../components/ProjectAreaShell";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

type ModuleId = "ground" | "comms" | "core" | "adcs" | "power" | "payload" | "storage";

/** A layered block diagram: ground, on-board core, and the drivers that touch hardware. */
const MODULES: Array<{ id: ModuleId; lane: 0 | 1 | 2 | 3; pt: string; en: string; ptRole: string; enRole: string; controls: string[] }> = [
  { id: "ground", lane: 0, pt: "Segmento solo", en: "Ground segment", ptRole: "Estação, passagens, telemetria", enRole: "Station, passes, telemetry", controls: [] },
  { id: "comms", lane: 1, pt: "Pilha de comunicação", en: "Communication stack", ptRole: "Enquadramento e retransmissão", enRole: "Framing and retransmission", controls: ["radio", "antenna", "transceiver", "communication"] },
  { id: "core", lane: 1, pt: "Núcleo de bordo", en: "Flight core", ptRole: "Modos, escalonador, telemetria", enRole: "Modes, scheduler, telemetry", controls: ["computer", "obc", "on-board"] },
  { id: "adcs", lane: 2, pt: "Controle de atitude", en: "Attitude control", ptRole: "Determinação e apontamento", enRole: "Determination and pointing", controls: ["wheel", "magnetorquer", "adcs", "attitude"] },
  { id: "power", lane: 2, pt: "Gerência de energia", en: "Power manager", ptRole: "Orçamento, cortes, modo seguro", enRole: "Budget, shedding, safe mode", controls: ["battery", "eps", "solar", "power"] },
  { id: "payload", lane: 2, pt: "Driver do payload", en: "Payload driver", ptRole: "Aquisição e compressão", enRole: "Acquisition and compression", controls: ["camera", "payload", "optics"] },
  { id: "storage", lane: 3, pt: "Armazenamento", en: "Storage", ptRole: "Buffer de bordo e fila de downlink", enRole: "On-board buffer and downlink queue", controls: ["storage", "memory"] }
];

const LINKS: Array<[ModuleId, ModuleId]> = [["ground", "comms"], ["comms", "core"], ["core", "adcs"], ["core", "power"], ["core", "payload"], ["payload", "storage"], ["storage", "comms"]];
const LANES = [
  { lane: 0 as const, pt: "Em solo", en: "On the ground", Icon: RadioTower },
  { lane: 1 as const, pt: "Bordo · núcleo", en: "On board · core", Icon: Cpu },
  { lane: 2 as const, pt: "Bordo · drivers", en: "On board · drivers", Icon: Code2 },
  { lane: 3 as const, pt: "Bordo · dados", en: "On board · data", Icon: Code2 }
];

type Edge = { id: string; path: string };

/** Connectors are measured from the laid-out blocks, so they survive any reflow. */
function useModuleEdges(deps: unknown[]) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const origin = frame.getBoundingClientRect();
    setEdges(LINKS.flatMap(([from, to]) => {
      const start = frame.querySelector(`#software-${from}`)?.getBoundingClientRect();
      const end = frame.querySelector(`#software-${to}`)?.getBoundingClientRect();
      if (!start || !end) return [];
      const x1 = start.left + start.width / 2 - origin.left, x2 = end.left + end.width / 2 - origin.left;
      const downwards = end.top >= start.bottom - 1;
      const y1 = downwards ? start.bottom - origin.top : start.top - origin.top;
      const y2 = downwards ? end.top - origin.top : end.bottom - origin.top;
      const bend = Math.max(12, Math.abs(y2 - y1) / 2);
      return [{ id: `${from}-${to}`, path: `M${x1},${y1} C${x1},${y1 + (downwards ? bend : -bend)} ${x2},${y2 - (downwards ? bend : -bend)} ${x2},${y2}` }];
    }));
  }, []);
  useEffect(() => {
    measure();
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    for (const block of frame.querySelectorAll(".software-block")) observer.observe(block);
    return () => observer.disconnect();
  }, [measure, ...deps]);
  return { frameRef, edges };
}

export function SoftwarePage({ language, project, onOpenRequirements }: { language: Language; project: MissionProject; onOpenRequirements: () => void }) {
  const pt = language === "pt";
  const model = project.engineeringSystem;
  const entities = model?.entities.filter((entity) => !["system", "subsystem"].includes(entity.kind)) ?? [];
  const requirements = model?.requirements ?? [];
  const controlled = (module: typeof MODULES[number]) => entities.filter((entity) => module.controls.some((hint) => `${entity.id} ${entity.name}`.toLowerCase().includes(hint))).slice(0, 3);
  const c = pt ? {
    eyebrow: "Área do projeto", title: "Software", subtitle: "A arquitetura de software do satélite e os elementos do sistema que cada módulo controla.",
    repo: "Conectar repositório GitHub", soon: "Em breve", repoHint: "Módulos, commits e testes virão do repositório, ligados a estes blocos.",
    controls: "Controla", requirements: "Requisitos", seeRequirements: "Ver requisitos", none: "Sem elemento correspondente",
    count: `${MODULES.length} módulos`
  } : {
    eyebrow: "Project area", title: "Software", subtitle: "The satellite's software architecture and the system elements each module controls.",
    repo: "Connect GitHub repository", soon: "Coming soon", repoHint: "Modules, commits and tests will come from the repository, tied to these blocks.",
    controls: "Controls", requirements: "Requirements", seeRequirements: "See requirements", none: "No matching element",
    count: `${MODULES.length} modules`
  };

  const { frameRef, edges } = useModuleEdges([entities.length, requirements.length, language]);

  return <ProjectAreaShell language={language} project={project} icon={<Code2 aria-hidden="true" />} eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} counter={c.count}
    actions={<button type="button" className="area-repo-action" disabled title={c.soon}><FolderGit2 aria-hidden="true" />{c.repo}<small>{c.soon}</small></button>}>
    <p className="area-repo-hint"><Link2 aria-hidden="true" />{c.repoHint}</p>
    <div className="software-diagram" ref={frameRef}>
      <svg className="software-edges" aria-hidden="true"><defs><marker id="software-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="#5c86ab" /></marker></defs>
        {edges.map((edge) => <path key={edge.id} d={edge.path} markerEnd="url(#software-arrow)" />)}
      </svg>
      {LANES.map(({ lane, pt: ptLane, en, Icon }) => <div className="software-lane" key={lane}>
        <span className="software-lane-label"><Icon aria-hidden="true" />{pt ? ptLane : en}</span>
        <div className="software-lane-blocks">
          {MODULES.filter((module) => module.lane === lane).map((module) => {
            const parts = controlled(module);
            const related = requirements.filter((requirement) => requirement.relatedEntityIds.some((id) => parts.some((part) => part.id === id)));
            return <article className={`software-block lane-${lane}`} key={module.id} id={`software-${module.id}`}>
              <strong>{pt ? module.pt : module.en}</strong>
              <small>{pt ? module.ptRole : module.enRole}</small>
              <div className="software-block-ports">
                <span className="software-port"><em>{c.controls}</em>{parts.length ? parts.map((part) => part.name).join(", ") : c.none}</span>
                {related.length > 0 && <span className="software-port req"><em>{c.requirements}</em>{related.map((requirement) => requirement.id).join(", ")}</span>}
              </div>
            </article>;
          })}
        </div>
      </div>)}
      <p className="software-legend" aria-label={pt ? "Ligações entre módulos" : "Links between modules"}>
        {LINKS.map(([from, to]) => {
          const name = (id: ModuleId) => { const module = MODULES.find((item) => item.id === id)!; return pt ? module.pt : module.en; };
          return `${name(from)} → ${name(to)}`;
        }).join(" · ")}
      </p>
    </div>
    <AreaPreviewNote text={pt
      ? `Os elementos e requisitos citados nos blocos vêm da arquitetura deste projeto (${entities.length} elementos, ${requirements.length} requisitos). Os módulos e suas ligações são a estrutura proposta; o repositório ainda não está conectado.`
      : `The elements and requirements named in the blocks come from this project's architecture (${entities.length} elements, ${requirements.length} requirements). The modules and their links are the proposed structure; the repository is not connected yet.`} />
    <button type="button" className="area-cross-link" onClick={onOpenRequirements}><Code2 aria-hidden="true" />{c.seeRequirements}</button>
  </ProjectAreaShell>;
}
