// Page-by-page audit against a running PRODUCTION build (see docs/PERFORMANCE.md):
//   node --experimental-strip-types scripts/audit/probe.ts [baseUrl] [--throttle] [--out file.json]
// For every page: server timing, web vitals (FCP, LCP, CLS, long-task total), transferred bytes by type, console
// errors/warnings, failed requests, and an axe-core run with WCAG 2.2 AA rules. Creates throw-away users (…@x.co) in the LOCAL database.
// Lab numbers from one machine are not field data: they rank pages and catch regressions; they do not prove real-user Core Web Vitals.
import { chromium, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createWorld, publishPlan, login } from "../../e2e/helpers.ts";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:3060").replace(/\/$/, "");
const THROTTLE = args.includes("--throttle");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

type Row = { page: string; ttfb: number; fcp: number; lcp: number; cls: number; longTasks: number; jsLoad: number; js: number; css: number; font: number; img: number; other: number; requests: number; consoleIssues: string[]; failed: string[]; axe: { id: string; impact: string; nodes: number; sample: string }[] };

async function measure(page: Page, path: string): Promise<Row> {
  const consoleIssues: string[] = [], failed: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => { if (["error", "warning"].includes(m.type())) consoleIssues.push(`${m.type()}: ${m.text().slice(0, 160)}`); };
  const onFail = (r: { url(): string; failure(): { errorText: string } | null }) => { const f = r.failure(); if (f && !/ERR_ABORTED/.test(f.errorText)) failed.push(`${r.url().slice(0, 100)} ${f.errorText}`); };
  page.on("console", onConsole); page.on("requestfailed", onFail);
  await page.addInitScript(() => {
    const w = window as unknown as { __v: { lcp: number; cls: number; lt: number } }; w.__v = { lcp: 0, cls: 0, lt: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__v.lt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
  });
  await page.goto(BASE + path, { waitUntil: "load" });
  const jsLoad = await page.evaluate(() => (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => /\.js(\?|$)/.test(r.name)).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0));
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const by = { js: 0, css: 0, font: 0, img: 0, other: 0 };
    for (const r of [...res, nav as unknown as PerformanceResourceTiming]) { const b = r.transferSize || r.encodedBodySize || 0; const t = r.initiatorType; const n = r.name;
      if (/\.js(\?|$)/.test(n) || t === "script") by.js += b; else if (/\.css(\?|$)/.test(n) || t === "css" || t === "link" && /css/.test(n)) by.css += b; else if (/\.(woff2?|ttf)/.test(n)) by.font += b; else if (t === "img" || /\.(png|jpe?g|webp|avif|svg|gif)/.test(n)) by.img += b; else by.other += b; }
    const v = (window as unknown as { __v: { lcp: number; cls: number; lt: number } }).__v;
    return { ttfb: nav.responseStart, fcp, lcp: v.lcp, cls: v.cls, longTasks: v.lt, requests: res.length + 1, ...by };
  });
  await page.evaluate(axeSource);
  const ax = await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
    return r.violations.map((v: { id: string; impact: string; nodes: { html: string }[] }) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0].html.slice(0, 90) }));
  });
  page.off("console", onConsole); page.off("requestfailed", onFail);
  const k = (n: number) => Math.round(n / 1024);
  return { page: path, ttfb: Math.round(m.ttfb), fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), cls: +m.cls.toFixed(3), longTasks: Math.round(m.longTasks), jsLoad: k(jsLoad), js: k(m.js), css: k(m.css), font: k(m.font), img: k(m.img), other: k(m.other), requests: m.requests, consoleIssues, failed, axe: ax };
}

async function newContext(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: "es-CO" });
  const page = await ctx.newPage();
  if (THROTTLE) { const c = await ctx.newCDPSession(page); await c.send("Emulation.setCPUThrottlingRate", { rate: 4 }); await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }); }
  return { ctx, page };
}

const browser = await chromium.launch({ channel: "chrome" });
const rows: Row[] = [];
const run = async (page: Page, paths: string[]) => { for (const p of paths) { const r = await measure(page, p); rows.push(r); } };

{ const { ctx, page } = await newContext(browser); await run(page, ["/", "/login", "/signup", "/forgot-password", "/privacidad", "/terminos", "/no-existe"]); await ctx.close(); }

const w = await createWorld("audit"); await publishPlan(w);
{ const { ctx, page } = await newContext(browser); await login(page, w.trainerEmail);
  await run(page, ["/trainer", "/trainer/clients", `/trainer/clients/${w.clientId}`, `/trainer/clients/${w.clientId}/messages`, "/trainer/plans", "/trainer/exercises", "/trainer/billing", "/trainer/notifications", "/trainer/account"]); await ctx.close(); }
{ const { ctx, page } = await newContext(browser); await login(page, w.clientEmail);
  await run(page, ["/client", "/client/plan", "/client/progress", "/client/assessment", "/client/measurements", "/client/photos", "/client/messages", "/client/assistant", "/client/privacy"]); await ctx.close(); }
await browser.close();

console.log(`\nbase=${BASE} ${THROTTLE ? "(CPU 4x, 1.6 Mbps/150 ms)" : "(no throttling)"}`);
console.log("page".padEnd(40), "TTFB  FCP  LCP   CLS  LT JS@load JS+idle CSS font img req | console failed axe");
for (const r of rows) console.log(r.page.replace(w.clientId, "{c}").padEnd(40), String(r.ttfb).padStart(4), String(r.fcp).padStart(4), String(r.lcp).padStart(5), String(r.cls).padStart(5), String(r.longTasks).padStart(3), String(r.jsLoad).padStart(7), String(r.js).padStart(7), String(r.css).padStart(3), String(r.font).padStart(4), String(r.img).padStart(3), String(r.requests).padStart(3), "|", String(r.consoleIssues.length).padStart(4), String(r.failed.length).padStart(5), String(r.axe.length).padStart(3));
console.log("\nAxe (WCAG 2.2 AA + best practice) — violations:");
for (const r of rows) for (const a of r.axe) console.log(`  ${r.page.replace(w.clientId, "{c}")} → [${a.impact}] ${a.id} ×${a.nodes}  ${a.sample.replace(/\s+/g, " ")}`);
console.log("\nConsole warnings/errors and failed requests:");
for (const r of rows) for (const c of [...r.consoleIssues, ...r.failed]) console.log(`  ${r.page.replace(w.clientId, "{c}")} → ${c}`);
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
