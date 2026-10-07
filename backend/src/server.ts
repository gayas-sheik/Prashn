import app from './app';
import { config } from './config/env';
import { getDb } from './database/db';

const startServer = async () => {
  try {
    // Initialize DB connection here
    await getDb();
    console.log('[Database]: SQLite initialized');

    app.listen(config.port, () => {
      console.log(`[Server]: API running at http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
