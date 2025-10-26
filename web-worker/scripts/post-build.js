#!/usr/bin/env node

/**
 * Post-build script to export WebSocketSession Durable Object
 * This adds the export to .open-next/worker.js after the build completes
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, '../.open-next/worker.js');

try {
  let content = fs.readFileSync(workerPath, 'utf8');

  // Check if export already exists
  if (content.includes('WebSocketSession')) {
    console.log('✓ WebSocketSession export already exists in worker.js');
    process.exit(0);
  }

  // Add export after the other Durable Object exports
  const exportLine = `export { WebSocketSession } from "../src/lib/websocket/WebSocketSession";\n`;
  const insertAfter = 'export { BucketCachePurge } from "./.build/durable-objects/bucket-cache-purge.js";';

  if (content.includes(insertAfter)) {
    content = content.replace(
      insertAfter,
      insertAfter + '\n' + exportLine
    );

    fs.writeFileSync(workerPath, content, 'utf8');
    console.log('✓ Successfully added WebSocketSession export to worker.js');
  } else {
    console.warn('⚠ Could not find insertion point in worker.js');
    console.warn('Please manually add this line to .open-next/worker.js:');
    console.warn(exportLine);
  }
} catch (error) {
  console.error('✗ Error modifying worker.js:', error.message);
  console.warn('\nPlease manually add this line to .open-next/worker.js after the other exports:');
  console.warn('export { WebSocketSession } from "../src/lib/websocket/WebSocketSession";');
  process.exit(1);
}
