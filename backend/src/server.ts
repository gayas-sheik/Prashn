import app from './app';
import { config } from './config/env';
import { getDb } from './database/db';
import { documentProcessor } from './processing/processor';

const startServer = async () => {
  try {
    // Initialize DB connection here
    await getDb();
    console.log('[Database]: SQLite initialized');
    await documentProcessor.recover();

    app.listen(config.port, () => {
      console.log(`[Server]: API running at http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
