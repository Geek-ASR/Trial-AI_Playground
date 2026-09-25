#!/usr/bin/env node
/**
 * Browser smoke test: loads every route of a running build, solves a lesson,
 * enters the 3D world, walks through a portal and runs every simulation lab. Run `npm run build && npx vite preview`
 * first, then `npm run smoke`. Set CHROMIUM_PATH if Chromium isn't auto-detected.
 */
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const step = (s) => console.log('•', s);

for (const route of ['', '#/learn', '#/blog', '#/news', '#/about', '#/forge', '#/functions']) {
  await page.goto(base + route);
  await page.waitForSelector('main > *');
  step(`route ${route || '/'} ok`);
}

await page.goto(base + '#/learn/f1-functions');
await page.waitForSelector('.cm-editor');
await page.click('button.seg:has-text("JavaScript")');
await page.click('.cm-content');
await page.keyboard.press('Control+A');
await page.keyboard.insertText('function square(x) { return x * x; }');
await page.click('text=Run & check');
await page.waitForSelector('.success', { timeout: 10000 });
step('lesson solved in JavaScript');

await page.goto(base + '#/play');
await page.waitForSelector('.loading-overlay.done', { timeout: 120000 });
await page.click('.start-card .btn-primary');
await page.evaluate(() => document.querySelector('.start-overlay')?.setAttribute('hidden', ''));
const place = () => page.textContent('.hud-place');
step(`spawned in: ${await place()}`);

// Stand three blocks in front of the Foundations portal ring and walk through it.
// (Software GPUs render a few frames a second, so we start close.)
await page.evaluate(() => {
  const { engine } = window.neuralcraft;
  const hub = { x: 160, z: 160 };
  const a = -Math.PI / 2; // Foundations is the first realm, due north of the hub
  const px = hub.x + Math.cos(a) * 9 + 0.5, pz = hub.z + Math.sin(a) * 9 + 0.5;
  engine.player.teleport(px, 25.01, pz, Math.atan2(-Math.cos(a), -Math.sin(a)));
});
await page.keyboard.down('KeyW');
await page.waitForFunction(() => document.querySelector('.hud-place')?.textContent?.includes('Foundations'), null, { timeout: 90000 });
await page.keyboard.up('KeyW');
step(`walked through a portal to: ${await place()}`);

// Visit every lab and run its simulation for a few seconds.
const LABS = { valley: 'Valley', galton: 'Galton', kmeans: 'K-Means', cathedral: 'Cathedral', galaxy: 'Galaxy', maze: 'Maze' };
for (const [lab, name] of Object.entries(LABS)) {
  await page.evaluate((l) => {
    const { engine } = window.neuralcraft;
    engine.teleport(l);
    engine.fastForward(3);
  }, lab);
  await page.waitForFunction((n) => document.querySelector('.hud-place')?.textContent?.includes(n), name, { timeout: 60000 });
  step(`lab ${lab}: ${await place()}`);
}
const digit = await page.evaluate(async () => {
  const { labs, engine } = window.neuralcraft;
  engine.teleport('cathedral');
  labs.cathedral.showSample();
  await new Promise((r) => setTimeout(r, 1500));
  engine.fastForward(1);
  return labs.cathedral.result?.prediction ?? null;
});
step(`cathedral classified a sample digit: ${JSON.stringify(digit)}`);

// Playground: free cursor, earning credits and a code build with shapes.
await page.evaluate(() => {
  window.neuralcraft.engine.teleport('playground');
  window.neuralcraft.engine.player.pitch = 0;
});
await page.waitForFunction(() => document.querySelector('.hud-place')?.textContent?.includes('Playground'), null, { timeout: 60000 });
step(`arrived: ${await place()}`);
await page.keyboard.press('Shift+KeyM');
await page.waitForFunction(() => window.neuralcraft.engine.freeCursor === true, null, { timeout: 5000 });
step('Shift+M switched to a free cursor');
await page.keyboard.press('KeyQ');
await page.waitForSelector('.credits-panel');
const before = Number((await page.textContent('.cred-big')).replace(/[^0-9]/g, ''));
await page.click('.credits-panel .seg:has-text("Code")');
await page.click('.code-card:has-text("ReLU")');
await page.click('.credits-panel .seg:has-text("JavaScript")');
await page.click('.credits-panel .cm-content');
await page.keyboard.press('Control+A');
await page.keyboard.insertText('function relu(x) { return Math.max(0, x); }');
await page.click('.credits-panel button:has-text("Run & check")');
await page.waitForSelector('.cred-feedback.ok', { timeout: 15000 });
const after = Number((await page.textContent('.cred-big')).replace(/[^0-9]/g, ''));
if (!(after > before)) throw new Error(`credits did not increase (${before} → ${after})`);
step(`solved a code challenge: ⚡ ${before} → ${after}`);
await page.keyboard.press('Escape');
await page.keyboard.press('KeyB');
await page.waitForSelector('.builder .seg');
await page.click('.builder .seg:has-text("JavaScript")');
await page.waitForSelector('.builder .cm-editor');
await page.selectOption('.builder select', 'robot');
await page.click('.builder button:has-text("Build it")');
await page.waitForFunction(() => /Built .*shapes/.test(document.querySelector('.builder-status')?.textContent || ''), null, { timeout: 30000 });
step(`code build: ${await page.textContent('.builder-status')}`);


await browser.close();
if (errors.length) {
  console.error('Page errors:', errors);
  process.exit(1);
}
console.log('Smoke test passed.');
