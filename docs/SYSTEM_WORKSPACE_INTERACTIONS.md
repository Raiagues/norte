# System and Discovery interaction revision — 2026-09-08

The reported production view could not move cards, placed connected sibling subsystems in a long chain, opened requirements as a modal, and hid Discovery actions. This revision changes interaction and navigation without supplying a predefined Quetzal architecture.

## Behavior

- The left explorer exposes every extracted system, subsystem and component, supports search and preserves ancestors in search results. Breadcrumbs and explicit Explore actions change hierarchy levels. Selecting a card does not silently navigate away.
- All levels exposes the complete saved model. Element relationships includes direct technical neighbors across hierarchy boundaries. Containment determines the normal architecture layout; relationship exploration and scenarios follow technical connections. Containment remains a dashed structural link, without an impact arrow.
- Cards support pointer dragging, pan/zoom, fit, reset and Alt + arrows. Positions are stored in `navigation.systemLayouts` by hierarchy/relationship/requirement view. Position changes leave engineering facts, memory revision and source evidence unchanged.
- Requirements occupy a dismissible sidebar beside the graph on desktop. Search, facets, trace and edit remain available. Tracing keeps the list open. Scenario requirement lists also dock beside the canvas. Narrow screens stack the explorer, canvas and requirement list in a scrollable workspace.
- Discovery has visible create, test change, system targets, connect, duplicate and delete controls. Ideas with no recognized parameter change still offer an explicit target picker. New and duplicated ideas are placed in free space without moving existing cards. Board links and positions remain separate from physical engineering relations.

## Document review

`POST /api/system-ai/generate` accepts an optional `preview` boolean. Initialization still reuses an existing model. Explicit preview bypasses that reuse, reads only persisted linked artifacts, checks access/CSRF and rejects memory changes while extraction is running. Preview neither persists the model nor unlocks conception. The existing authenticated project-save path applies a reviewed candidate as a team correction.

Review retains the baseline identity, existing correction history and the architecture needed to reopen saved scenarios. Applying a new interpretation resets view positions so old coordinates cannot overlap newly arranged components. Snapshot references are validated separately from the new current architecture. Source coverage counts are evidence citations, not a guarantee of completeness. The generic extraction prompt asks for coverage of the supplied documents without encoding expected Quetzal systems, numbers or benchmark answers.

## Validation

The automated browser flow uses real React, authenticated Fastify routes and temporary persistence, with a synthetic source document and a simulated external provider. It checks drag persistence after reload, unchanged engineering facts, hierarchy search, all levels, cross-subsystem relationships, a docked requirements list, source-preserving requirement edits, explicit Discovery actions, review without mutation, explicit application and an archived scenario after reinterpretation. Desktop and 390px viewport checks include horizontal overflow checks and screenshots. These are interaction tests, not evidence of live extraction quality.

Unit/API checks cover sibling hierarchy layout, directional curve endpoints, multi-system overview, scenario archives, preview nonmutation and rejection when source memory changes. Existing deterministic Quetzal and structural checks remain separate; evaluator documents and expected results were not edited.

The real-document acceptance script supports `NORTE_ACCEPTANCE_PREVIEW=true` to exercise document review through the browser after initial extraction. This new live run has **not executed**: automatic approval review rejected sending the five seeded documents to Gemini. No new live-provider success or extraction-completeness claim is made for this revision. Render deployment remains manual.

Completed checks for this revision: `npm run quality` (98 client tests, all 17 backend test files, typecheck, lint and production build), `npm run test:visual`, `npm run test:visual:quetzal`, secret scanning, dependency audit (zero vulnerabilities), five deterministic Quetzal cases and four masked structural cases. The Quetzal browser fixture now maps its evidence to the IDs returned by the local artifact upload and waits for memory loading before initialization; the frozen benchmark context was not changed.
