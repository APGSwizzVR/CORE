const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const { startServer } = require('./index.cjs');

const port = Number(process.env.PORT || 4179);
const host = process.env.CORE_BIND_ADDRESS || '0.0.0.0';
const dataDir = process.env.CORE_DATA_DIR || path.join(process.cwd(), 'core-data');

startServer({ port, host, dataDir }).then(({ port: activePort }) => {
  process.stdout.write(`CORE server listening on ${host}:${activePort}\n`);
  process.stdout.write(`Persistent data directory: ${dataDir}\n`);
}).catch((error) => {
  process.stderr.write(`CORE server could not start: ${error.message}\n`);
  process.exitCode = 1;
});
