import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style/entry.css'
// main.tsx
const originalLog = console.log;

function safeSerialize(value: any, seen = new WeakSet()): any {
  if (value === null || typeof value !== 'object') {
    // primitives are fine, except functions/symbols which aren't structured-cloneable
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
    if (typeof value === 'symbol') return value.toString();
    return value;
  }

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (value instanceof Node) {
    // DOM elements, React refs, etc. — not cloneable
    return `[DOMNode: ${value.nodeName}]`;
  }

  if (Array.isArray(value)) {
    return value.map((v) => safeSerialize(v, seen));
  }

  // Plain-ish object: copy only enumerable own properties, recursively sanitized
  const out: Record<string, any> = {};
  for (const key of Object.keys(value)) {
    try {
      out[key] = safeSerialize(value[key], seen);
    } catch {
      out[key] = '[Unserializable]';
    }
  }
  return out;
}

console.log = (...args: any[]) => {
  originalLog(...args);
  try {
    const safeArgs = args.map((a) => safeSerialize(a));
    window.api.forwardLog(safeArgs);
  } catch (err) {
    originalLog('[forwardLog failed]', err);
  }
};

createRoot(document.getElementById('root')!).render(
  <App />
)
