// Importing this gives a test a DOM while it keeps Node's own fetch, Request and Headers. The route
// handlers need those: happy-dom's replacements drop the Origin and Cookie headers they check.
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:3000/" });
const dom = win as unknown as Record<string, unknown>;
const globals = globalThis as Record<string, unknown>;

for (const key of Object.getOwnPropertyNames(win)) {
  if (key in globals) continue;
  Object.defineProperty(globals, key, { configurable: true, writable: true, value: dom[key] });
}
for (const key of ["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage"]) {
  Object.defineProperty(globals, key, { configurable: true, writable: true, value: dom[key] });
}
// happy-dom's Web Animations reject when an animation is cancelled; without them motion animates in JS.
delete (dom.Element as { prototype: { animate?: unknown } }).prototype.animate;
globals.IS_REACT_ACT_ENVIRONMENT = true;
