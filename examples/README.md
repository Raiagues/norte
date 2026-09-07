# Engineering validation example

[`engineering-validation.mjs`](engineering-validation.mjs) contains a deliberately synthetic physical system and its source text. It has 15 entities, two requirements and explicit current, power, energy and mass relationships. Nothing in this example is a production engineering fact.

The normal application starts with an empty validation project. Neither startup nor failed document extraction loads this fixture.

To test the real document-extraction flow, deliberately attach [`engineering-validation.txt`](engineering-validation.txt) in Project Memory and select **Start conception** with Gemini configured on the server. [`engineering-validation.json`](engineering-validation.json) is a static fixture for scripts and tests; the UI does not automatically import it.

## Try the frontend locally

Start the browser-only demo with the repository's Node version:

```bash
VITE_DEMO_MODE=true npm run dev:web
```

Open `http://127.0.0.1:5173/norte/` and select **Engineering Validation Project**. In the browser's developer console, run:

```js
await (await import('/norte/src/lib/demoApi.ts'))
  .loadEngineeringValidationExample('LOAD_ENGINEERING_VALIDATION');
location.reload();
```

This development-server import deliberately attaches the synthetic text source, persists its system model and unlocks Conception for the active validation project. It backs up the previous demo state in browser storage. It refuses other active projects and the full production client. The import path assumes the default `/norte/` base; it is a local Vite command, not a GitHub Pages production URL.

Open **System** to inspect the architecture. Try these changes in a scenario:

| Change | Expected result |
| --- | --- |
| Radio peak current → `1.2 A` | Regulator critical: required current exceeds `800 mA`. |
| Radio peak current → `600 mA` | Regulator compatible with that current constraint. |
| Radio operating power → `1 W` | Autonomy calculation yields `80 min`, below the `90 min` requirement. |
| Payload mass → `280 g` | Total mass becomes `380 g`, above the `350 g` requirement. |

Clear the scenario to return to the unchanged baseline. These results validate the declared fixture assumptions and the implemented rules; they do not validate an actual product.

To explicitly restore a clean browser validation state, run this local Vite console command and reload:

```js
(await import('/norte/src/lib/demoApi.ts'))
  .resetDemoValidationData('RESET_VALIDATION_DATA');
location.reload();
```

## Test the model

```bash
node --test server/impact-engine.test.mjs
npx vitest run tests/demoApi.test.ts
```

The legacy Arduino example in its own subdirectory remains an optional reference. It is not part of the neutral validation seed.
