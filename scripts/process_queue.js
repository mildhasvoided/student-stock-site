// ESM wrapper for process_queue.cjs
// This file lets callers run `node scripts/process_queue.js` even when
// package.json sets "type": "module". It delegates to the CommonJS
// implementation in process_queue.cjs using createRequire.
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);

// Resolve and require the CommonJS implementation
const cjsPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'process_queue.cjs');
try {
    require(cjsPath);
} catch (err) {
    console.error('❌ Failed to load process_queue.cjs from process_queue.js:', err);
    // Exit non-zero so CI will notice
    process.exit(1);
}
