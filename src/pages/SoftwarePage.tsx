import { Boxes, Cpu, FileCheck2, FolderGit2, Network, TestTubeDiagonal, Link2 } from "lucide-react";
import { ProjectAreaShell, AreaPreviewNote } from "../components/ProjectAreaShell";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

/** Modules a small satellite team recognises, drawn against whatever architecture exists. */
const MODULES = [
  { id: "flight-software", pt: "Software de bordo", en: "Flight software", layer: "onboard", controls: ["computer", "obc", "on-board"], pt_role: "Laço principal, modos de operação e telemetria.", en_role: "Main loop, operating modes and telemetry." },
  { id: "attitude-control", pt: "Controle de atitude", en: "Attitude control", layer: "onboard", controls: ["wheel", "magnetorquer", "adcs", "attitude"], pt_role: "Determinação e controle de apontamento.", en_role: "Attitude determination and pointing control." },
  { id: "power-manager", pt: "Gerência de energia", en: "Power manager", layer: "onboard", controls: ["battery", "eps", "solar", "power"], pt_role: "Orçamento de energia, cortes de carga e modo seguro.", en_role: "Energy budget, load shedding and safe mode." },
  { id: "payload-driver", pt: "Driver do payload", en: "Payload driver", layer: "onboard", controls: ["camera", "payload", "optics", "storage"], pt_role: "Aquisição, compressão e armazenamento.", en_role: "Acquisition, compression and storage." },
  { id: "comms-stack", pt: "Pilha de comunicação", en: "Communication stack", layer: "onboard", controls: ["radio", "antenna", "transceiver", "communication"], pt_role: "Enquadramento, janelas de passagem e retransmissão.", en_role: "Framing, pass windows and retransmission." },
  { id: "ground-segment", pt: "Segmento solo", en: "Ground segment", layer: "ground", controls: [], pt_role: "Estação, agendamento de passagens e painel de telemetria.", en_role: "Station, pass scheduling and telemetry dashboard." }
];

export function SoftwarePage({ language, project, onOpenRequirements }: { language: Language; project: MissionProject; onOpenRequirements: () => void }) {
  const pt = language === "pt";
  const model = project.engineeringSystem;
  const entities = model?.entities.filter((entity) => !["system", "subsystem"].includes(entity.kind)) ?? [];
  const requirements = model?.requirements ?? [];
  const controlled = (module: typeof MODULES[number]) => entities.filter((entity) => module.controls.some((hint) => `${entity.id} ${entity.name}`.toLowerCase().includes(hint))).slice(0, 4);
  const c = pt ? {
    eyebrow: "Área do projeto", title: "Software", subtitle: "A arquitetura de software e o que ela controla, exige e comprova no resto do sistema.",
    repo: "Conectar repositório GitHub", soon: "Em breve", repoHint: "Módulos, commits e testes virão do repositório, ligados aos elementos do sistema.",
    controls: "Controla no sistema", requirements: "Requisitos relacionados", tests: "Testes", onboard: "A bordo", ground: "Em solo",
    noEntity: "Nenhum elemento correspondente na arquitetura atual.", noRequirement: "Os requisitos entram quando forem alocados a este módulo.",
    seeRequirements: "Ver requisitos", count: `${MODULES.length} módulos`
  } : {
    eyebrow: "Project area", title: "Software", subtitle: "The software architecture and what it controls, demands and proves across the rest of the system.",
    repo: "Connect GitHub repository", soon: "Coming soon", repoHint: "Modules, commits and tests will come from the repository, tied to system elements.",
    controls: "Controls in the system", requirements: "Related requirements", tests: "Tests", onboard: "On board", ground: "On the ground",
    noEntity: "No matching element in the current architecture.", noRequirement: "Requirements appear once they are allocated to this module.",
    seeRequirements: "See requirements", count: `${MODULES.length} modules`
  };

  return <ProjectAreaShell language={language} project={project} icon={<Boxes aria-hidden="true" />} eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} counter={c.count}
    actions={<button type="button" className="area-repo-action" disabled title={c.soon}><FolderGit2 aria-hidden="true" />{c.repo}<small>{c.soon}</small></button>}>
    <p className="area-repo-hint"><Link2 aria-hidden="true" />{c.repoHint}</p>
    {(["onboard", "ground"] as const).map((layer) => <section key={layer} className="area-layer">
      <h2 className="area-layer-title"><Cpu aria-hidden="true" />{layer === "onboard" ? c.onboard : c.ground}</h2>
      <div className="area-grid">
        {MODULES.filter((module) => module.layer === layer).map((module) => {
          const parts = controlled(module);
          const related = requirements.filter((requirement) => requirement.relatedEntityIds.some((id) => parts.some((part) => part.id === id))).slice(0, 3);
          return <article className="area-card" key={module.id}>
            <header><Boxes aria-hidden="true" /><strong>{pt ? module.pt : module.en}</strong></header>
            <p>{pt ? module.pt_role : module.en_role}</p>
            <div className="area-card-links">
              <div className="area-card-link"><small><Network aria-hidden="true" />{c.controls}</small>{parts.length ? <ul>{parts.map((part) => <li key={part.id}>{part.name}</li>)}</ul> : <em>{c.noEntity}</em>}</div>
              <div className="area-card-link"><small><FileCheck2 aria-hidden="true" />{c.requirements}</small>{related.length ? <ul>{related.map((requirement) => <li key={requirement.id}>{requirement.id} · {requirement.title}</li>)}</ul> : <em>{c.noRequirement}</em>}</div>
              <div className="area-card-link"><small><TestTubeDiagonal aria-hidden="true" />{c.tests}</small><em>{pt ? "Suítes do repositório, ligadas a cada requisito." : "Repository suites, tied to each requirement."}</em></div>
            </div>
          </article>;
        })}
      </div>
    </section>)}
    <AreaPreviewNote text={pt
      ? `Os elementos e requisitos mostrados vêm da arquitetura deste projeto (${entities.length} elementos, ${requirements.length} requisitos). Os módulos são a estrutura proposta; o repositório ainda não está conectado.`
      : `The elements and requirements shown come from this project's architecture (${entities.length} elements, ${requirements.length} requirements). The modules are the proposed structure; the repository is not connected yet.`} />
    <button type="button" className="area-cross-link" onClick={onOpenRequirements}><FileCheck2 aria-hidden="true" />{c.seeRequirements}</button>
  </ProjectAreaShell>;
}
