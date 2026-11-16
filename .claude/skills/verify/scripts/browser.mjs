#!/usr/bin/env node
// Drives the web UI in a headless Chrome over the DevTools protocol. No npm package:
// Node.js has fetch and WebSocket, and Chrome is the browser on this machine.
//
//   node browser.mjs --base http://127.0.0.1:3210 [--profile <dir>] [--chrome <binary>] <steps.json | ->
//
// The steps are a JSON array. Each step is an object with one of these keys:
//   {"viewport": [1440, 900]}             CSS pixels; add "scale": 2 for a sharper image
//   {"media": {"scheme": "dark", "reducedMotion": true}}
//   {"goto": "/runs/abc"}                 waits for the load event
//   {"reload": true}
//   {"wait": 300}                         milliseconds
//   {"waitFor": "css selector"}           until it is in the page (add "timeout": ms)
//   {"waitText": "Finished"}              until the page text contains it
//   {"waitGone": "css selector"}
//   {"click": "css selector"}  {"hover": "css selector"}  {"focus": "css selector"}
//   {"type": "text"}                      into the focused element
//   {"press": "Enter"}                    add "shift": true; Tab, Escape, Space, arrows
//   {"eval": "document.title"}            prints the value as JSON
//   {"shot": "path.png"}                  add "selector" to clip to one element
//   {"console": true}                     prints the errors and warnings so far
// The process exits 1 when a step fails or when the page logged an error, unless the
// last step is {"console": "allow"}.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const KEYS = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  Home: { key: "Home", code: "Home", keyCode: 36 },
  End: { key: "End", code: "End", keyCode: 35 },
};

function fail(message) {
  console.error(`browser.mjs: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const base = option("--base") ?? fail("--base <url> is required");
const profileArg = option("--profile");
const chromeArg = option("--chrome");
const stepsArg = args[0] ?? fail("pass a steps file, or - for stdin");
const steps = JSON.parse(readFileSync(stepsArg === "-" ? 0 : stepsArg, "utf8"));

const chrome = [chromeArg, ...CHROME_PATHS].find(
  (path) => path && existsSync(path),
);
if (!chrome)
  fail("no Chrome found. Pass --chrome <path to the browser binary>.");

const profile = profileArg
  ? resolve(profileArg)
  : mkdtempSync(join(tmpdir(), "research-marshal-chrome-"));
mkdirSync(profile, { recursive: true });
const portFile = join(profile, "DevToolsActivePort");
rmSync(portFile, { force: true });

const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function debuggerUrl() {
  for (let i = 0; i < 100; i += 1) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").split("\n");
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`)
        .then((response) => response.json())
        .catch(() => []);
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    }
    await sleep(100);
  }
  throw new Error("Chrome did not open a debugging port");
}

const problems = [];
let socket;
let nextId = 0;
const pending = new Map();
const waiters = new Map();

function send(method, params = {}) {
  nextId += 1;
  const id = nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((done, reject) =>
    pending.set(id, { done, reject, method }),
  );
}

function once(event) {
  return new Promise((done) => waiters.set(event, done));
}

function onMessage(raw) {
  const message = JSON.parse(raw);
  if (message.id !== undefined) {
    const call = pending.get(message.id);
    pending.delete(message.id);
    if (message.error)
      call?.reject(new Error(`${call.method}: ${message.error.message}`));
    else call?.done(message.result);
    return;
  }
  waiters.get(message.method)?.(message.params);
  waiters.delete(message.method);
  if (message.method === "Runtime.consoleAPICalled") {
    const { type, args: values } = message.params;
    if (type === "error" || type === "warning") {
      const text = values
        .map((value) => value.value ?? value.description ?? "")
        .join(" ");
      problems.push({ level: type, text });
    }
  }
  if (message.method === "Runtime.exceptionThrown") {
    const { exceptionDetails: details } = message.params;
    problems.push({
      level: "error",
      text: details.exception?.description ?? details.text,
    });
  }
  if (message.method === "Log.entryAdded") {
    const { level, text, url } = message.params.entry;
    if (level === "error" || level === "warning") {
      problems.push({ level, text: url ? `${text} (${url})` : text });
    }
  }
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? "evaluate failed",
    );
  }
  return result.result.value;
}

async function until(expression, timeout, what) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`timed out after ${timeout} ms waiting for ${what}`);
}

async function boxOf(selector) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  if (!box) throw new Error(`no element matches ${selector}`);
  return box;
}

async function pointAt(selector) {
  const box = await boxOf(selector);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  return point;
}

const media = { scheme: null, reducedMotion: false };

async function run(step) {
  if (step.viewport) {
    const [width, height] = step.viewport;
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: step.scale ?? 1,
      mobile: false,
    });
  } else if (step.media) {
    Object.assign(media, step.media);
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: media.scheme ?? "" },
        {
          name: "prefers-reduced-motion",
          value: media.reducedMotion ? "reduce" : "",
        },
      ],
    });
  } else if (step.goto !== undefined) {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: new URL(step.goto, base).href });
    await loaded;
  } else if (step.reload) {
    const loaded = once("Page.loadEventFired");
    await send("Page.reload");
    await loaded;
  } else if (step.wait !== undefined) {
    await sleep(step.wait);
  } else if (step.waitFor) {
    await until(
      `document.querySelector(${JSON.stringify(step.waitFor)}) !== null`,
      step.timeout ?? 15_000,
      step.waitFor,
    );
  } else if (step.waitGone) {
    await until(
      `document.querySelector(${JSON.stringify(step.waitGone)}) === null`,
      step.timeout ?? 15_000,
      `${step.waitGone} to go`,
    );
  } else if (step.waitText) {
    await until(
      `document.body.innerText.includes(${JSON.stringify(step.waitText)})`,
      step.timeout ?? 15_000,
      `the text ${step.waitText}`,
    );
  } else if (step.click) {
    const point = await pointAt(step.click);
    const button = { button: "left", clickCount: 1, ...point };
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...button });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...button,
    });
  } else if (step.hover) {
    await pointAt(step.hover);
  } else if (step.focus) {
    await boxOf(step.focus);
    await evaluate(
      `document.querySelector(${JSON.stringify(step.focus)}).focus()`,
    );
  } else if (step.type !== undefined) {
    await send("Input.insertText", { text: step.type });
  } else if (step.press) {
    const key = KEYS[step.press] ?? fail(`unknown key ${step.press}`);
    const event = {
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      nativeVirtualKeyCode: key.keyCode,
      modifiers: step.shift ? 8 : 0,
    };
    await send("Input.dispatchKeyEvent", {
      type: key.text ? "keyDown" : "rawKeyDown",
      text: key.text,
      ...event,
    });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  } else if (step.eval) {
    console.log(JSON.stringify(await evaluate(step.eval)));
  } else if (step.shot) {
    const clip = step.selector
      ? { ...(await boxOf(step.selector)), scale: 1 }
      : undefined;
    const { data } = await send("Page.captureScreenshot", {
      format: "png",
      clip,
    });
    mkdirSync(dirname(resolve(step.shot)), { recursive: true });
    writeFileSync(step.shot, Buffer.from(data, "base64"));
    console.log(`shot ${step.shot}`);
  } else if (step.console) {
    for (const problem of problems)
      console.log(`console ${problem.level}: ${problem.text}`);
    if (problems.length === 0) console.log("console: no error and no warning");
  } else {
    fail(`unknown step ${JSON.stringify(step)}`);
  }
}

let exitCode = 0;
try {
  socket = new WebSocket(await debuggerUrl());
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => onMessage(event.data));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  for (const step of steps) await run(step);
  const allow = steps.at(-1)?.console === "allow";
  const errors = problems.filter((problem) => problem.level === "error");
  if (errors.length > 0 && !allow) {
    for (const problem of errors)
      console.error(`console error: ${problem.text}`);
    exitCode = 1;
  }
} catch (error) {
  console.error(
    `browser.mjs: ${error instanceof Error ? error.message : error}`,
  );
  exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  await new Promise((done) => browser.once("exit", done));
  if (!profileArg) rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
