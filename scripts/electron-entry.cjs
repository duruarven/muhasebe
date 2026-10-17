// Test-only entry point: isolate the real Electron main process from any user data.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.ISLETMEM_TEST_DATA;
if (!dir || !path.isAbsolute(dir) || !fs.statSync(dir).isDirectory()) throw Error('An isolated test data directory is required.');
app.setPath('userData', dir);
require('../src/main');
