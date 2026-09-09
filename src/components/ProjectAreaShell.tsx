import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

type Props = {
  language: Language; project: MissionProject;
  title: string; counter?: string; actions?: ReactNode; children: ReactNode;
};

/** Same heading as Project Memory and Conception: the name, in caps, and nothing else. */
export function ProjectAreaShell({ language, project, title, counter, actions, children }: Props) {
  return <section className="project-area">
    <header className="project-area-head">
      <div className="project-area-heading">
        <div className="project-area-breadcrumb"><span>{project.name}</span><span>›</span><strong>{title}</strong></div>
        <h1>{title}</h1>
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
