# System, Discovery and Project Memory — interaction validation

## System

The searchable hierarchy exposes every extracted system, subsystem and component. Breadcrumbs and Explore open individual levels. All levels exposes the complete saved model; Element relationships follows direct technical neighbors across hierarchy boundaries. Containment determines the normal layout and remains visually distinct from technical interfaces.

Cards support dragging, pan/zoom, fit, reset and Alt + arrow keys. Positions persist per view in `navigation.systemLayouts`, independently of engineering facts and memory revision. Requirements occupy a dismissible sidebar on desktop, with search, facets, trace and edit. Tracing keeps the list open. Narrow screens stack the explorer, canvas and requirements.

Document review requests an explicit, nonpersisting preview from linked source artifacts. Applying it records corrections and archives the previous architecture for saved scenarios. Extraction quality is separate from interaction validation: this interface does not invent missing systems or guarantee complete source coverage.

## Discovery

Conception contains only System and Discovery. The Timeline component, Gantt helpers, styles and tab have been deleted. Old workspace preferences normalize to System.

Discovery starts with New idea. Connection, duplication and deletion controls appear when a card is selected. Saving a new or edited idea automatically asks the configured AI to interpret its text. The result is a short summary or clarification question on the card. Refine idea opens the same text editor; See impact evaluates a resolved proposal. There is no target/property selection form in Discovery and no regex recognition fallback. New and duplicated ideas use free positions without moving existing cards.

`POST /api/system-ai/interpret-hypothesis` receives project ID, hypothesis text and language. The server supplies the saved entity/requirement/property inventory to Gemini. It authenticates and authorizes access, requires CSRF, limits requests and rejects results when the architecture changes during interpretation. Raw source documents, canvas coordinates, correction archives and scenario history are excluded.

Interpretation may target an existing entity or requirement, propose a named component replacement, or request clarification. Unknown targets/keys, unsupported unit conversions, invented quoted wording, no-op changes and duplicate updates produce clarification. Relative increments and scaling are computed against current values. Interpretation never changes the baseline or infers physical dependencies. The impact engine evaluates the temporary change when requested.

Stale responses after card edits are ignored; closing the workspace cancels pending browser requests. Interpretation requests have a 30-second deadline and no automatic provider retry. A failed request leaves the idea saved and offers a retry on the card. The browser-only demo explicitly reports that connected AI is required.

## Project Memory

One uppercase title replaces the eyebrow/title/subtitle stack. The introductory team/artifact descriptions and success-readiness message are removed. Incomplete-memory and API-error messages remain functional.

One artifact grid displays linked team references and project documents, with at most four columns and fewer columns on narrow screens. The workspace scrolls vertically so additional rows remain accessible. Team artifacts retain ownership and unlink behavior; project files retain their edit/delete behavior. No documents are deleted by the UI simplification.

## Checks

- Quality: 96 client tests, all 18 backend test files, typecheck, lint and production build.
- Authenticated browser checks: automatic interpretation, inline clarification without a modal, card operations, two-tab keyboard navigation, uppercase heading, unified artifact grid, mobile scrolling, existing System interactions and scenario preservation. The external provider is simulated with explicit synthetic responses.
- Quetzal browser checks: the existing positive-margin and continuous-transmission scenarios still work with an explicit provider fixture. This is not an extraction-quality result.
- Dependency audit: zero vulnerabilities. Secret scanning and diff checks pass.

The live command `node --env-file-if-exists=.env.local scripts/acceptance-discovery.mjs` uses only a synthetic architecture and invented Portuguese phrases; it reads no database or Quetzal documents. The first interpretation with the configured `gemini-3.5-flash-lite` did not receive an HTTP response before the 30-second deadline. A separate minimal request also timed out after 15 seconds, while a public HTTPS connectivity check succeeded. The remaining live interpretation cases did not run. Live semantic acceptance therefore remains unconfirmed; simulated browser success is not represented as a live-provider success. No Render deployment was triggered.
