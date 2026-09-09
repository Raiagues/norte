import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

/** The vocabulary every area shares, so a link means the same thing on each page. */
export const LINK_KINDS = {
  architecture: ["Arquitetura", "Architecture"],
  decision: ["Decisões", "Decisions"],
  artifact: ["Artefatos", "Artifacts"],
  requirement: ["Requisitos", "Requirements"],
  software: ["Software", "Software"],
  verification: ["Verificação", "Verification"]
} as const;
export type LinkKind = keyof typeof LINK_KINDS;

type Props = {
  language: Language; project: MissionProject; icon: ReactNode;
  eyebrow: string; title: string; subtitle: string; counter?: string; actions?: ReactNode; children: ReactNode;
};

export function ProjectAreaShell({ language, project, icon, eyebrow, title, subtitle, counter, actions, children }: Props) {
  return <section className="project-area">
    <header className="project-area-head">
      <div className="project-area-heading">
        <span className="project-area-icon">{icon}</span>
        <div>
          <small>{eyebrow} · {project.name}</small>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="project-area-actions">
        {counter && <span className="project-area-counter">{counter}</span>}
        <span className="project-area-preview">{language === "pt" ? "Prévia" : "Preview"}</span>
        {actions}
      </div>
    </header>
    <div className="project-area-body">{children}</div>
  </section>;
}

/** States plainly which part of a page is real project data and which is the direction of travel. */
export function AreaPreviewNote({ icon, text }: { icon?: ReactNode; text: string }) {
  return <p className="area-preview-note">{icon ?? <Info aria-hidden="true" />}{text}</p>;
}
