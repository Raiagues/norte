import { useRef, useState } from "react";
import { FileUp, Link2, Upload, X } from "lucide-react";
import type { ConnectedArtifact } from "../lib/team";
import { artifactIsStoredFile } from "../lib/artifacts";
import type { Language } from "../lib/types";
import "../artifact-source.css";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const SAFE_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain"
]);
const SAFE_EXTENSIONS = /\.(?:c|cc|cpp|csv|doc|docx|h|hpp|ino|json|md|ods|odt|pdf|py|rtf|ts|tsx|txt|xls|xlsx)$/iu;

type Props = {
  language: Language;
  artifact?: ConnectedArtifact | null;
  onError?: (message: string) => void;
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

export function ArtifactSourceFields({ language, artifact = null, onError }: Props) {
  const initialIsFile = Boolean(artifact && artifactIsStoredFile(artifact));
  const [mode, setMode] = useState<"link" | "file">(initialIsFile ? "file" : "link");
  // A stored file arrives without its bytes. Keeping the existing name means the
  // form submits no url and the server preserves the content it already holds.
  const [url, setUrl] = useState(artifact?.url || "");
  const [fileName, setFileName] = useState(artifact?.fileName || "");
  const [mimeType, setMimeType] = useState(artifact?.mimeType || "");
  const [size, setSize] = useState(artifact?.size || 0);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const c = language === "pt" ? {
    link: "Link",
    file: "Arquivo",
    linkLabel: "Endereço",
    drop: "Arraste um arquivo aqui",
    browse: "ou escolha no computador",
    formats: "PDF, DOC, planilha, CSV, texto ou código · até 4 MB",
    remove: "Remover arquivo",
    tooLarge: "O arquivo deve ter no máximo 4 MB.",
    unsafe: "Esse formato não é aceito. Use PDF, documento, planilha, texto ou código.",
    readError: "Não foi possível ler este arquivo."
  } : {
    link: "Link",
    file: "File",
    linkLabel: "Address",
    drop: "Drop a file here",
    browse: "or choose it from your computer",
    formats: "PDF, DOC, spreadsheet, CSV, text, or code · up to 4 MB",
    remove: "Remove file",
    tooLarge: "The file must be no larger than 4 MB.",
    unsafe: "That format is not accepted. Use a PDF, document, spreadsheet, text, or code file.",
    readError: "This file could not be read."
  };

  function report(message: string) {
    setError(message);
    onError?.(message);
  }

  async function acceptFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      report(c.tooLarge);
      return;
    }
    const safeMime = !file.type || SAFE_MIME_TYPES.has(file.type);
    if (!safeMime || !SAFE_EXTENSIONS.test(file.name)) {
      report(c.unsafe);
      return;
    }
    setReading(true);
    try {
      const dataUrl = await readFile(file);
      setUrl(dataUrl);
      setFileName(file.name);
      setMimeType(file.type || "text/plain");
      setSize(file.size);
      report("");
    } catch {
      report(c.readError);
    } finally {
      setReading(false);
    }
  }

  function switchMode(nextMode: "link" | "file") {
    report("");
    setMode(nextMode);
    if (nextMode === "link") {
      setUrl("");
      setFileName("");
      setMimeType("");
      setSize(0);
    }
    if (nextMode === "file" && !url.startsWith("data:")) setUrl("");
  }

  return <fieldset className="artifact-source-fields">
    <legend>{language === "pt" ? "Origem" : "Source"}</legend>
    <div className="artifact-source-modes" role="group" aria-label={language === "pt" ? "Origem do artefato" : "Artifact source"}>
      <button className={mode === "link" ? "active" : ""} type="button" onClick={() => switchMode("link")}><Link2 aria-hidden="true" />{c.link}</button>
      <button className={mode === "file" ? "active" : ""} type="button" onClick={() => switchMode("file")}><FileUp aria-hidden="true" />{c.file}</button>
    </div>

    {mode === "link" ? <label className="artifact-link-field"><span>{c.linkLabel}</span><input name="url" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} placeholder="https://" /></label> : <>
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="fileName" value={fileName} />
      <input type="hidden" name="mimeType" value={mimeType} />
      <input type="hidden" name="size" value={String(size)} />
      <input ref={inputRef} className="artifact-file-input" type="file" tabIndex={-1} accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,.odt,.csv,.txt,.md,.json,.ino,.c,.cc,.cpp,.h,.hpp,.py,.ts,.tsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void acceptFile(file); }} />
      {fileName ? <div className="artifact-file-ready"><FileUp aria-hidden="true" /><span><strong>{fileName}</strong><small>{Math.max(1, Math.round(size / 1024))} KB</small></span><button type="button" title={c.remove} aria-label={c.remove} onClick={() => { setUrl(""); setFileName(""); setMimeType(""); setSize(0); if (inputRef.current) inputRef.current.value = ""; }}><X aria-hidden="true" /></button></div> : <button
        className={dragging ? "artifact-drop-zone dragging" : "artifact-drop-zone"}
        type="button"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void acceptFile(file); }}
      ><Upload aria-hidden="true" /><span><strong>{reading ? (language === "pt" ? "Lendo arquivo..." : "Reading file...") : c.drop}</strong><small>{c.browse}</small><em>{c.formats}</em></span></button>}
    </>}
    {error && <p className="artifact-source-error" role="alert">{error}</p>}
  </fieldset>;
}
