import { FileText, Compass, Satellite, ListChecks, Code2, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Language } from "./types";

export type RailKey = "memory" | "conception" | "requirements" | "software" | "verification" | "operations";
export type RailStop = {
  key: RailKey;
  pt: string;
  en: string;
  Icon: LucideIcon;
  /** Phases answer to the pipeline's unlock rule; areas are always reachable. */
  step?: 0 | 1;
  area?: "requirements" | "software" | "verification";
  upcoming?: true;
};

/**
 * The single order of the project, used by the sidebar rail and by the
 * previous/next controls on every page, so they can never disagree.
 */
export const PROJECT_RAIL: RailStop[] = [
  { key: "memory", pt: "Memória do projeto", en: "Project memory", Icon: FileText, step: 0 },
  { key: "conception", pt: "Concepção", en: "Conception", Icon: Compass, step: 1 },
  { key: "requirements", pt: "Requisitos", en: "Requirements", Icon: ListChecks, area: "requirements" },
  { key: "software", pt: "Software", en: "Software", Icon: Code2, area: "software" },
  { key: "verification", pt: "Verificação", en: "Verification", Icon: ShieldCheck, area: "verification" },
  { key: "operations", pt: "Operações", en: "Operations", Icon: Satellite, upcoming: true }
];

export const railLabel = (stop: RailStop, language: Language) => language === "pt" ? stop.pt : stop.en;
export const railIndex = (key: RailKey) => PROJECT_RAIL.findIndex((stop) => stop.key === key);
export const railNeighbour = (key: RailKey, offset: -1 | 1): RailStop | undefined => PROJECT_RAIL[railIndex(key) + offset];
