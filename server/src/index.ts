import { config } from "./config.js";
import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`3dvista-assistant backend (tour: ${config.TOUR_ID}) escuchando en :${config.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
