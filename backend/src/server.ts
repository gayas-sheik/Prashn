import app from './app';
import { config } from './config/env';
import { getDb } from './database/db';
import { documentProcessor } from './processing/processor';

const startServer = async () => {
  try {
    // Initialize DB connection here
    if (config.databaseMode === 'local') await getDb();
    console.log(`[Database]: ${config.databaseMode} configured`);
    await documentProcessor.recover();

    const server = app.listen(config.port, () => {
      console.log(`[Server]: API running at http://localhost:${config.port}`);
    });
    const shutdown = () => {
      server.close(() => { process.exitCode = 0; });
      setTimeout(() => process.exit(1), 30000).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
