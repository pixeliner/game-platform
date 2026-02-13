import { createGatewayServer, loadGatewayConfig } from './index.js';

async function main(): Promise<void> {
  const config = loadGatewayConfig();
  const server = createGatewayServer({ config });

  await server.start();
  console.log(`Gateway listening on ws://${config.host}:${server.getPort()}/ws`);

  const shutdown = async (): Promise<void> => {
    await server.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });
}

void main();
