#!/usr/bin/env node
/**
 * Syncs ~/shelly-bridge/server.js into lib/bridge-bundle.ts
 * Run: node scripts/sync-bridge-bundle.js
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../../shelly-bridge/server.js');
const bundlePath = path.resolve(__dirname, '../lib/bridge-bundle.ts');

if (!fs.existsSync(serverPath)) {
  console.error('server.js not found at:', serverPath);
  process.exit(1);
}

const serverJs = fs.readFileSync(serverPath, 'utf8');

// Extract version from server.js comment
const versionMatch = serverJs.match(/Shelly Bridge Server v([\d.]+)/);
const version = versionMatch ? versionMatch[1] : '0.0.0';

// Escape for template literal: backticks and ${
const escaped = serverJs
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const output = `/**
 * Bridge server bundle — auto-generated from ~/shelly-bridge/server.js
 * DO NOT EDIT MANUALLY — run: node scripts/sync-bridge-bundle.js
 */

export const BRIDGE_SERVER_VERSION = '${version}';

export const BRIDGE_SERVER_JS = \`${escaped}\`;
`;

fs.writeFileSync(bundlePath, output, 'utf8');
console.log(`bridge-bundle.ts synced (v${version}, ${serverJs.length} bytes)`);
