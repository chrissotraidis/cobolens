#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distRoot = resolve(repoRoot, "dist");

if (!existsSync(resolve(distRoot, "index.html"))) {
  console.error("Rendered UI smoke needs dist/index.html. Run npm run build first.");
  process.exit(1);
}

let cdp;

async function main() {
  const appPort = await freePort();
  const cdpPort = await freePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "cobolens-ui-smoke-profile-"));
  const server = await startStaticServer(distRoot, appPort);
  const browser = await launchBrowser(cdpPort, userDataDir);

  try {
    const appUrl = `http://127.0.0.1:${appPort}/`;
    const pageWs = await createBrowserPage(cdpPort, appUrl);
    cdp = await JsonWebSocket.connect(pageWs);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await waitFor(() => evaluate("document.title === 'Cobolens'"), "Cobolens page title");
    await waitFor(() => evaluate("Boolean(document.querySelector('.topbar-import'))"), "top-bar import action");

    const initial = await pageState();
    assertEqual(initial.importProjectButtons, 1, "first run shows one Import Project action");
    assertEqual(initial.sampleButtons, 1, "first run shows one Sample action");
    assertEqual(initial.searchLabel, "", "top search has no redundant visible label");
    assertEqual(initial.searchPlaceholder, "Find programs, copybooks, jobs...", "top search keeps a concrete placeholder");
    assertEqual(initial.privacyDotLabel, "Local: no code leaves", "top bar keeps local privacy status as a compact labeled dot");
    assert(!initial.topbarText.includes("Local: no code leaves"), "top bar no longer spends visible space on the local privacy sentence");
    assert(!initial.hasOverlay, "first run has no framework error overlay");

    await setFileInputFiles(".project-import-input", [
      resolve(repoRoot, "fixtures/m6-bakeoff/src/LINEAGE.cbl"),
      resolve(repoRoot, "fixtures/m6-bakeoff/copybook/CUSTOMER.cpy"),
      resolve(repoRoot, "fixtures/m6-bakeoff/copybook/REPORT.cpy"),
      resolve(repoRoot, "fixtures/m6-bakeoff/jcl/DAILYLN.jcl"),
    ]);
    await waitFor(() => evaluate("document.body.innerText.includes('Imported project')"), "browser project import");
    await waitFor(
      () => evaluate("Boolean(document.querySelector('button[aria-label=\"Focus CUSTOMER, Copybook\"]'))"),
      "imported codebase tree",
    );
    const imported = await pageState();
    assert(imported.leftText.includes("Imported project"), "browser import labels the loaded project");
    assert(imported.leftText.includes("LINEAGE"), "browser import discovers the LINEAGE program");
    assert(imported.leftText.includes("CUSTOMER"), "browser import discovers the CUSTOMER copybook");
    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await waitFor(() => evaluate("document.querySelector('#dependency-graph')?.innerText.includes('CUSTOMER-RECORD')"), "imported source opens");

    await click(".topbar-sample");
    await waitFor(
      () => evaluate("Boolean(document.querySelector('button[aria-label=\"Focus CUSTOMER, Copybook\"]'))"),
      "sample codebase tree",
    );
    const loaded = await pageState();
    assertEqual(loaded.importProjectButtons, 1, "loaded sample keeps one Import Project action");
    assertEqual(loaded.sampleButtons, 1, "loaded sample keeps one Sample action");
    assert(!loaded.topbarText.includes("Local: no code leaves"), "loaded sample keeps privacy as a compact status dot");
    assert(!loaded.leftText.includes("INGEST"), "left rail no longer shows ingest block");
    assert(!loaded.leftText.includes("Demo mode"), "left rail does not carry browser-mode filler copy");
    assert(!loaded.leftText.includes("SEARCH RESULTS"), "idle left rail hides search results");
    assert(
      loaded.leftText.indexOf("CODEBASE") >= 0 && loaded.leftText.indexOf("CODEBASE") < loaded.leftText.indexOf("LEGEND & FILTERS"),
      "left rail prioritizes Codebase before filters",
    );

    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(2)')?.className.includes('is-active')"), "Source tab after tree click");
    const customerSource = await pageState();
    assert(customerSource.workspaceText.includes("CUSTOMER-RECORD"), "CUSTOMER tree click opens source text");
    assertEqual(customerSource.sourceLineChip, "line 1", "source toolbar keeps the line marker separate from the file picker");

    await click('button[aria-label^="Dependencies"]');
    await click('button[aria-label="Used by: show LINEAGE COPIES CUSTOMER at src/LINEAGE.cbl:11"]');
    await waitFor(() => evaluate("document.querySelector('.source-focus-note')?.innerText.includes('src/LINEAGE.cbl:11')"), "dependency row opens focused source");

    await fill('.global-search input[type="search"]', "PIC");
    await waitFor(() => evaluate("document.body.innerText.includes('No matching graph symbols')"), "honest PIC empty state");
    await fill('.global-search input[type="search"]', "SQLCODE");
    await waitFor(() => evaluate("Boolean(document.querySelector('button[aria-label=\"Search result SQLCODE data-item\"]'))"), "SQLCODE search result");
    await click('button[aria-label="Search result SQLCODE data-item"]');
    await waitFor(() => evaluate("document.querySelector('.source-line.is-highlighted')?.innerText.includes('SQLCODE')"), "SQLCODE source jump");

    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await click('button[aria-label="Chat"]');
    await fill(".chat-composer input", "What uses CUSTOMER?");
    await click(".chat-composer button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.evidence-more-toggle'))"), "compact evidence control");
    const chat = await pageState();
    assertEqual(chat.visibleEvidenceRows, 4, "chat evidence is compact by default");
    assert(chat.evidenceMoreText.startsWith("Show "), "chat evidence exposes a show-more control");

    await click('button[aria-label="Open citation BANK.CUSTOMER.MASTER at jcl/DAILYLN.jcl:3"]');
    await waitFor(() => evaluate("document.querySelector('.source-focus-note')?.innerText.includes('jcl/DAILYLN.jcl:3')"), "evidence opens focused source");

    console.log(JSON.stringify({
      checks: {
        "visible import action": true,
        "browser project import": true,
        "single sample action": true,
      "tree selection opens Source": true,
      "dependency row opens focused source": true,
      "symbol search is honest": true,
        "chat evidence is compact": true,
        "evidence opens focused source": true,
      },
    }, null, 2));
  } finally {
    cdp?.close();
    browser.kill();
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 1_000);
      browser.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}

async function pageState() {
  return evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((button) => button.innerText.trim());
    const leftText = document.querySelector('.left-pane')?.innerText ?? '';
    const workspaceText = document.querySelector('#dependency-graph')?.innerText ?? '';
    return {
      importProjectButtons: buttons.filter((text) => text === 'Import Project').length,
      sampleButtons: buttons.filter((text) => text === 'Sample').length,
      searchLabel: document.querySelector('.global-search span')?.textContent?.trim() ?? '',
      searchPlaceholder: document.querySelector('.global-search input')?.getAttribute('placeholder') ?? '',
      exportToast: document.querySelector('.export-toast')?.innerText ?? '',
      privacyDotLabel: document.querySelector('.privacy-dot')?.getAttribute('aria-label') ?? '',
      topbarText: document.querySelector('.topbar')?.innerText ?? '',
      leftText,
      workspaceText,
      sourceLineChip: document.querySelector('.source-line-chip')?.textContent?.trim() ?? '',
      visibleEvidenceRows: document.querySelectorAll('.evidence-block .citation-list button').length,
      evidenceMoreText: document.querySelector('.evidence-more-toggle')?.textContent?.trim() ?? '',
      hasOverlay: document.body.innerText.includes('Internal server error') || document.body.innerText.includes('plugin:vite')
    };
  })()`);
}

async function click(selector) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing element: ${selector}');
    element.click();
    return true;
  })()`);
}

async function fill(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing input: ${selector}');
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function setFileInputFiles(selector, files) {
  const root = commonDirectory(files);
  const payload = await Promise.all(files.map(async (filePath) => {
    const rel = relative(root, filePath).split(sep).join("/");
    return {
      name: basename(filePath),
      relativePath: `${basename(root)}/${rel}`,
      text: await readFile(filePath, "utf8"),
    };
  }));
  const fileCount = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing file input: ${selector}');
    const transfer = new DataTransfer();
    for (const item of ${JSON.stringify(payload)}) {
      const file = new File([item.text], item.name, { type: 'text/plain' });
      Object.defineProperty(file, 'webkitRelativePath', { configurable: true, value: item.relativePath });
      transfer.items.add(file);
    }
    Object.defineProperty(element, 'files', {
      configurable: true,
      get() {
        return transfer.files;
      },
    });
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.files.length;
  })()`);
  if (fileCount !== files.length) {
    throw new Error(`Expected ${files.length} selected files, got ${fileCount}`);
  }
}

function commonDirectory(files) {
  if (!files.length) return repoRoot;
  let commonParts = dirname(files[0]).split(sep);
  for (const filePath of files.slice(1)) {
    const parts = dirname(filePath).split(sep);
    let index = 0;
    while (index < commonParts.length && index < parts.length && commonParts[index] === parts[index]) {
      index += 1;
    }
    commonParts = commonParts.slice(0, index);
  }
  return commonParts.join(sep) || sep;
}

async function evaluate(expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
    throw new Error(description);
  }
  return response.result.value;
}

async function waitFor(check, label, timeoutMs = 5_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(80);
  }
  let state = "";
  try {
    state = cdp ? `\nCurrent page state:\n${JSON.stringify(await evaluate(`(() => ({
      href: location.href,
      title: document.title,
      text: document.body.textContent?.slice(0, 1200) ?? "",
      html: document.body.innerHTML.slice(0, 1200),
      events: globalThis.__noop ?? null
    }))()`), null, 2)}` : "";
    if (cdp?.events?.length) {
      state += `\nRecent browser events:\n${JSON.stringify(cdp.events.slice(-12), null, 2)}`;
    }
  } catch {
    state = "";
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}${state}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Rendered UI smoke failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function startStaticServer(root, port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const filePath = safeResolve(root, url.pathname === "/" ? "/index.html" : url.pathname);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server;
}

function safeResolve(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to serve ${pathname}`);
  }
  return target;
}

function contentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  return types[extname(filePath)] ?? "application/octet-stream";
}

async function launchBrowser(cdpPort, userDataDir) {
  const browserPath = findBrowserPath();
  if (!browserPath) {
    throw new Error("Rendered UI smoke needs Chrome, Chromium, or Edge. Set CHROME_BIN to the browser executable.");
  }
  const child = spawn(browserPath, [
    "--headless=new",
    "--ignore-gpu-blocklist",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-networking",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) stderr += `\nBrowser exited with ${code}`;
  });
  await waitFor(() => httpJson(`http://127.0.0.1:${cdpPort}/json/version`), "browser debugging port", 10_000).catch((error) => {
    child.kill();
    throw new Error(`${error.message}\n${stderr.slice(-1000)}`);
  });
  return child;
}

function findBrowserPath() {
  const envPath = process.env.CHROME_BIN || process.env.CHROMIUM_BIN;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ]
    : process.platform === "win32"
      ? [
          join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
        ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function createBrowserPage(cdpPort, url) {
  const encoded = encodeURIComponent(url);
  let target;
  try {
    target = await httpJson(`http://127.0.0.1:${cdpPort}/json/new?${encoded}`, "PUT");
  } catch {
    target = await httpJson(`http://127.0.0.1:${cdpPort}/json/new?${encoded}`);
  }
  if (target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
  const targets = await httpJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("Could not create a browser page for UI smoke.");
  return page.webSocketDebuggerUrl;
}

function httpJson(url, method = "GET") {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.request(url, { method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          rejectRequest(new Error(`${method} ${url} returned ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch (error) {
          rejectRequest(error);
        }
      });
    });
    request.on("error", rejectRequest);
    request.end();
  });
}

function freePort() {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

class JsonWebSocket {
  static connect(wsUrl) {
    return new Promise((resolveConnect, rejectConnect) => {
      const url = new URL(wsUrl);
      const socket = net.connect(Number(url.port), url.hostname);
      const key = randomBytes(16).toString("base64");
      let handshake = Buffer.alloc(0);
      const client = new JsonWebSocket(socket);
      socket.once("connect", () => {
        socket.write([
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"));
      });
      socket.on("data", function onHandshake(chunk) {
        handshake = Buffer.concat([handshake, chunk]);
        const headerEnd = handshake.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = handshake.slice(0, headerEnd).toString();
        if (!header.startsWith("HTTP/1.1 101")) {
          rejectConnect(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          socket.destroy();
          return;
        }
        const expected = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        if (!header.toLowerCase().includes(`sec-websocket-accept: ${expected.toLowerCase()}`)) {
          rejectConnect(new Error("WebSocket accept key mismatch"));
          socket.destroy();
          return;
        }
        socket.off("data", onHandshake);
        const rest = handshake.slice(headerEnd + 4);
        socket.on("data", (data) => client.receive(data));
        if (rest.length) client.receive(rest);
        resolveConnect(client);
      });
      socket.once("error", rejectConnect);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(encodeWebSocketFrame(payload));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        rejectSend(new Error(`CDP call timed out: ${method}`));
      }, 10_000).unref?.();
    });
  }

  receive(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const frame = decodeWebSocketFrame(this.buffer);
      if (!frame) return;
      this.buffer = this.buffer.slice(frame.consumed);
      if (frame.opcode === 8) {
        this.close();
        return;
      }
      if (frame.opcode !== 1) continue;
      const message = JSON.parse(frame.payload.toString());
      if (!message.id) {
        this.events.push(message);
        if (this.events.length > 50) this.events.shift();
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    }
  }

  close() {
    this.socket.destroy();
  }
}

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text);
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + payload.length);
  frame[0] = 0x81;
  if (payload.length < 126) {
    frame[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const maskOffset = headerLength;
  const mask = randomBytes(4);
  mask.copy(frame, maskOffset);
  for (let index = 0; index < payload.length; index += 1) {
    frame[maskOffset + 4 + index] = payload[index] ^ mask[index % 4];
  }
  return frame;
}

function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = Boolean(buffer[1] & 0x80);
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskOffset = masked ? offset : -1;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  const payload = Buffer.from(buffer.slice(offset, offset + length));
  if (masked) {
    const mask = buffer.slice(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }
  return { opcode, payload, consumed: offset + length };
}

await main();
