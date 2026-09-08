# Extraction reliability investigation — 8 September 2026

## PRE-EXTRACTION-FIX CHECKPOINT

| Item | Recorded result |
| --- | --- |
| Branch | `main` |
| Commit | `6dd86398d63db3cd12a9d1e02b5097d670fe854a` |
| Push | Pushed to `origin/main`; `git ls-remote` matched the complete SHA; working tree clean |
| CI | [Quality](https://github.com/Raiagues/norte/actions/runs/34176635614), [Security / CodeQL](https://github.com/Raiagues/norte/actions/runs/34176635597), [Pages](https://github.com/Raiagues/norte/actions/runs/34176635611): success |
| Quality | TypeScript, ESLint, 87 frontend tests, 11 backend test files and production build passed |
| Security | Secret scan passed; dependency audit: zero vulnerabilities |
| Deterministic benchmark | Quetzal B10/B25/B26/B100/C1: 5/5 passed; A0 intentionally not run without a prediction |
| Structural benchmark | C2: 4/4 passed |
| Browser | Both `test:visual` and `test:visual:quetzal` passed; real UI/API, explicitly mocked provider |
| Private material | `.env`, `.env.local`, databases, backups and `var/` reports excluded; staged path inspection and secret scan passed |

This checkpoint was committed, pushed and checked **before** this audit and before any new prompt, schema, validator or benchmark changes. No Render operation was performed. Pushing main may activate existing deployment configuration; the owner controls Render deployment.

## Product audit before extraction changes

Sources reviewed: the four earlier product requests, the current ordered request, the user-approved `VALIDATED.md`, `PRODUCT_RESEARCH_ENGINEERING_REASONING.md`, `UX_RESEARCH.md`, `VALIDATION_QUETZAL1.md`, README, architecture, recent commits, production code and benchmark implementations. Later product decisions supersede the original generation button, permanent drawer and formal hypothesis form. “Verified” below describes the evidence available, not a usability study or a certified engineering review.

| Requirement | Implemented? | Verified how? | Remaining issue / scope |
| --- | --- | --- | --- |
| Only project selectable in sidebar; team belongs to project; no global default team | Yes | `MissionSidebar`, App bindings; navigation unit tests; browser switches between two projects with different teams | Legacy preference is only removed during explicit reset; no active selector uses it |
| Phase progress belongs to project | Yes | `projectStore` normalization and `completeConception`; server merge preserves unlocked progress | Full released-baseline version management is outside current implementation |
| Memory return, refresh and project switching preserve Conception access | Yes | Browser checks Memory → reload → Conception and two-project switch; migration unit tests | Tests use an isolated store |
| New Project visible, disabled for pointer/keyboard, no creation UI route | Yes, UI | Native disabled controls in Home and empty state; route allowlist in App; browser/native semantics | Authenticated POST project API still exists for persistence/import and tests; this is **not** a server-side creation ban |
| Create Team disabled; no alternative hidden creation button | Yes, UI | Native disabled Teams heading; all `setDialog` paths inspected (edit/member/artifact only) | Authenticated team-creation API remains available; invitation and existing-team editing remain supported |
| No Generate architecture action; Start conception generates automatically | Yes | App initialization + server route; browser asserts one generation | Real provider reliability is unresolved at checkpoint |
| Coherent loading, recoverable failure, persisted baseline | Yes | Indeterminate accessible activity UI; server atomic persist and memory-conflict tests; browser first failure/retry | No precise progress percentage; fixture browser latency is not provider latency |
| Re-entry does not regenerate or replace corrections | Yes | Client and server return existing baseline; browser request count and persistence checks | Changed memory marks revision rather than regenerating |
| No hidden fixture fallback; demo explicitly selected | Yes | Production service rejection paths; guarded demo helper; browser failed first extraction leaves no baseline | Demo and regression fixture results are never counted as live A0 |
| System first after Memory, remembered later workspace | Yes | `lastConceptionWorkspace`, automatic navigation, research rationale; browser checks | Decision informed by research, not comparative human testing |
| Discovery free brainstorming without organizer, clusters, semantic groups, generic suggestions, rewrite, maturity or AI moving cards | Yes | `BrainstormLab` active actions and organizer call sites inspected; browser card/history flow | Older organizer implementation may remain isolated; not an active Discovery feature |
| Contextual engineering hypothesis with few actions, consequences on canvas, no chat | Yes, bounded recognizer | Browser numeric duty/current/mass scenarios; shared impact engine | Ambiguous targets and component replacements need compact clarification; arbitrary natural language is not comprehensively supported |
| Visual proximity never treated as physical evidence | Yes | Engine follows typed, identified baseline relations only | Inferred links remain review, not measured physical facts |
| Macro architecture first; explicit drill-down and breadcrumb; graph not exhaustive | Yes | `SystemWorkspace` and graph projection; browser macro/drill-down checks | Very large real extracted graphs have not been stress-tested with engineers |
| Requirements separate from ordinary nodes; compact filters; selection highlights traces | Yes | Requirements overlay, trace projection; browser filter/edit/highlight checks | Extraction trace completeness remains an A0 issue |
| Selection does not open permanent drawer; explicit accessible details; graph dominant | Yes | Info affordance/dialog; keyboard open/close/focus; browser desktop/mobile | Nonfatal main bundle size warning remains |
| Facts have citations; calculations expose inputs/rule; inferences visibly classified | Yes, contract enforced | Source dialogs, evidence validator, deterministic reasoning records and tests | PDF citations cannot be text-verified and are downgraded; DOCX/XLSX not parsed; external links are metadata only |
| Why/path/requirement provenance auditable without chain-of-thought | Yes | Relation IDs, evidence locators, structured calculation records; provider private thoughts excluded | Missing source data stays review; it cannot establish an engineering claim |
| Show existing work instead of configuring AI | Yes | Linked Memory artifacts resolved server-side; no AI setup fields; Start needs project/team, not role assignment | Unsupported document formats require a supported export |
| Generate first; preserve engineer corrections as structured exportable data | Yes | `engineeringCorrections`, revision/transaction/source snapshots; unit and browser tests | Bounded history (1,000 records); no training pipeline or tamper-proof append-only server audit |
| Intelligence visual and every autonomous conclusion observable | Yes, within rules | Temporary scenario graph, typed paths, calculation and missing-data evidence | Bounded rule engine, not a general simulator or certification system |
| Fast hypothesis → impact | Yes, measured only in automation | Quetzal browser: 1 action from saved recognized card; 2 from typed content; 0 AI configuration; 133.4 ms local impact in checkpoint run | Initialization 1,564.6 ms used mocked provider; no student/engineer time-to-value study |
| README English, real state, official app vs frontend demo, generic local instructions, actual badges | Yes | Text/link/path review; supplied Render URL documented; workflow names match repo | Production release version was not re-deployed during this audit |
| Metrics and Quetzal claims bounded by evidence | Yes | README/validation docs distinguish deterministic, fixture, live failures and planned human metrics | Independent engineering review pending; A1 raw ingestion unmeasured; retrospective curation/pretraining contamination limits remain |
| Clean validation environment, obsolete local demos removed appropriately, Quetzal not OBSAT | Yes, local | Guarded seed/reset implementation and local persisted state: one neutral team, one Quetzal project, two source documents, no generated baseline | No production database inspection/reset authorized or performed |
| Reset explicit, backup first, no automatic destructive production behavior | Yes | Reset guards and tests; production/remote database refusal; startup preserves records | Existing production records intentionally untouched |
| Frozen evaluator and model/evaluation separation | Yes | Freeze hashes, source allowlist, runner import boundaries, holdout canary; deterministic and masked tests | Full A0 strict completeness has not passed; an earlier schema-accepted result fails final hierarchy contract |

### Audit conclusion and extraction handoff

The requested interaction model exists and its principal routes were exercised. The unresolved delivery risk is automatic extraction: six earlier physical requests produced two complete outputs, one HTTP 503 and three local timeouts. One output violated the evidence contract; the other was numerically useful but incomplete and fails the final hierarchy validator. Thus there is **no final-contract-approved live baseline** in that series. This is distinct from the nine passing deterministic/structural cases and passing mocked-provider UI tests.

The UI disables creation, while authenticated creation APIs remain. This distinction is recorded explicitly rather than presenting a disabled button as an authorization restriction. The request concerns visible controls and alternate UI routes; existing authenticated persistence endpoints were not removed.

The pre-extraction audit is complete. The next phase measures provider behavior, schema complexity and model output separately, preserving the frozen evaluator and private prior reports.
