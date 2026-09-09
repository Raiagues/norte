import { attachQuetzalArchitectureSources } from "./quetzal-source-extension.mjs";
import { loadLocalEnvironment } from "./local-environment.mjs";

// Local secrets must reach every entry point, not only `npm run dev`. Hosted
// deployments inject their own environment and are left untouched.
loadLocalEnvironment();

const { buildApp } = await import("./app.mjs");

const port = Number(process.env.PORT || process.env.NORTE_API_PORT || process.env.MISSION_API_PORT || 8787);
const host = process.env.NORTE_API_HOST || process.env.MISSION_API_HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const app = await buildApp();

try {
  const extension = await attachQuetzalArchitectureSources(app.missionStore);
  if (extension.added) app.log.info({ added: extension.added }, "Attached requested Quetzal mission sources and verified architecture fragments");
} catch (error) {
  // The transactional importer leaves the original project intact on failure.
  app.log.error(error, "Quetzal source extension not applied; preserving the existing project");
}
try {
  await app.listen({ host, port });
  app.log.info(`Norte API and Swagger: http://${host}:${port}/docs`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
