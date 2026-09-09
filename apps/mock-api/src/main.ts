import { createApp, readConfig } from './app';

async function main() {
  const { host, port } = readConfig();
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(port, host);
  console.log(`Mock API ready on port ${port}`);
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Mock API startup failed');
  process.exit(1);
});
