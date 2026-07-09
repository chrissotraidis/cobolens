#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { launchBrowser } from "./browser-launch.mjs";

const retry = await retryScenario();
const failure = await failureScenario();

const checks = {
  "browser launch retries once after an early process exit": retry.spawnCount === 2,
  "browser launch returns the successful retry process": retry.returnedSecondChild,
  "browser launch failure names the bounded attempt count": failure.includes("failed to start after 2 attempts"),
  "browser launch failure reports each attempt": failure.includes("Attempt 1/2") && failure.includes("Attempt 2/2"),
  "browser launch failure reports the exit code": failure.includes("code 37"),
  "browser launch failure preserves browser stderr": failure.includes("simulated browser boot failure"),
  "browser launch failure preserves the last port error": failure.includes("simulated connection refusal"),
};

console.log(JSON.stringify({ checks }, null, 2));

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Browser launch smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

async function retryScenario() {
  let spawnCount = 0;
  const children = [];
  const returned = await launchBrowser(9222, "/tmp/cobolens-browser-launch-smoke", {
    browserPath: "/fake/chrome",
    attempts: 2,
    timeoutMs: 30,
    pollMs: 1,
    pause: immediatePause,
    probeBrowser: async () => {
      if (spawnCount < 2) throw new Error("simulated connection refusal");
      return { ready: true };
    },
    spawnProcess: () => {
      spawnCount += 1;
      const child = mockChild();
      children.push(child);
      if (spawnCount === 1) {
        queueMicrotask(() => {
          child.stderr.write("first attempt exited");
          child.emit("exit", 17, null);
        });
      }
      return child;
    },
  });
  return { spawnCount, returnedSecondChild: returned === children[1] };
}

async function failureScenario() {
  try {
    await launchBrowser(9223, "/tmp/cobolens-browser-launch-smoke", {
      browserPath: "/fake/chrome",
      attempts: 2,
      timeoutMs: 30,
      pollMs: 1,
      pause: immediatePause,
      probeBrowser: async () => {
        throw new Error("simulated connection refusal");
      },
      spawnProcess: () => {
        const child = mockChild();
        queueMicrotask(() => {
          child.stderr.write("simulated browser boot failure");
          child.emit("exit", 37, null);
        });
        return child;
      },
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

function mockChild() {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}

function immediatePause() {
  return new Promise((resolvePause) => setImmediate(resolvePause));
}
