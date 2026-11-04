/**
 * End-to-end verification of the built app in headless Chromium (SwiftShader WebGL 2).
 * Run:  node scripts/e2e-test.mjs   (requires `playwright` resolvable, e.g. from /tmp/pwtest)
 * Opens dist/index.html directly via file:// so it also verifies direct-file opening.
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const require = createRequire(process.env.PW_DIR ? path.join(process.env.PW_DIR, "package.json") : import.meta.url);
const { chromium } = require("playwright");

const dist = path.resolve("dist/index.html");
const outDir = path.resolve("test-output");
fs.mkdirSync(outDir, { recursive: true });

function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex").slice(0, 12);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text().slice(0, 600)}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

await page.goto("file://" + dist);
await page.waitForSelector("text=Amefurashi");
check("direct file:// open shows upload screen", await page.isVisible("text=Choose Image"));

// Generate test images in the page (landscape + portrait with distinct colours) and upload them.
async function makeImage(w, h, name) {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, "#8fb3d9"); grad.addColorStop(0.55, "#d9d2c5"); grad.addColorStop(0.56, "#4a4a48"); grad.addColorStop(1, "#1e1e1e");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "#2b2f3a"; g.fillRect(w * 0.1, h * 0.25, w * 0.2, h * 0.35); g.fillStyle = "#b08c5a"; g.fillRect(w * 0.65, h * 0.3, w * 0.15, h * 0.3);
    g.fillStyle = "#ffe9b0"; g.beginPath(); g.arc(w * 0.72, h * 0.2, Math.min(w, h) * 0.03, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = `${Math.round(h * 0.06)}px sans-serif`; g.fillText("TOP-LEFT", w * 0.02, h * 0.08);
    return c.toDataURL("image/png");
  }, [w, h]);
  return { name, mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

async function upload(file) {
  const input = page.locator('input[type=file][accept="image/jpeg,image/png,image/webp"]').first();
  await input.setInputFiles(file);
  await page.waitForTimeout(1500);
}

async function exportFrame() {
  // Click from inside the page: the synchronous GPU render of a software (SwiftShader) export can outlast
  // Playwright's click-action wait, although the export itself completes.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Capture Frame"); setTimeout(() => b.click(), 0); }),
  ]);
  const p = path.join(outDir, download.suggestedFilename());
  await download.saveAs(p);
  return { path: p, buf: fs.readFileSync(p) };
}

// 1) Demo image workflow
await page.click("text=Try Demo Image");
await page.waitForTimeout(2500);
check("demo loads and shows image info", await page.isVisible("text=demo.jpg"));
await page.screenshot({ path: path.join(outDir, "01-demo-default.png") });
const shaderErrors = logs.filter((l) => /shader|program|GLSL|THREE\.WebGL/i.test(l));
check("no shader/program errors after first render", shaderErrors.length === 0, shaderErrors.join(" | ").slice(0, 800));

// 2) Pause + export at preview size, twice, compare determinism
await page.keyboard.press(" "); // pause
await page.waitForTimeout(300);
{
  const ti = page.locator('input[aria-label="Time in seconds"]');
  await ti.fill("2"); await ti.press("Enter"); await page.waitForTimeout(300);
}
await page.selectOption('select[aria-label="Output Size"]', "preview").catch(() => {});
const e1 = await exportFrame();
const e2 = await exportFrame();
const s1 = pngSize(e1.buf);
check("export PNG decodes with non-trivial size", s1.w > 100 && s1.h > 100, `${s1.w}x${s1.h}, ${e1.buf.length} bytes`);
check("repeat capture at same time+seed is byte-identical", sha(e1.buf) === sha(e2.buf), `${sha(e1.buf)} vs ${sha(e2.buf)}`);

// 3) Original size export matches image dimensions reported
const info = await page.textContent("aside");
const m = /(\d+) × (\d+) px ·/.exec(info || "");
await page.selectOption('select[aria-label="Output Size"]', "original");
const e3 = await exportFrame();
const s3 = pngSize(e3.buf);
check("original-size export matches image dimensions", m && s3.w === Number(m[1]) && s3.h === Number(m[2]), `${s3.w}x${s3.h} vs ${m && m[1] + "x" + m[2]}`);

// 4) Controls cause visible change: disable rain → different export
await page.selectOption('select[aria-label="Output Size"]', "preview");
const rainToggle = page.locator("div:has(> span:text-is('Rain')) [role=switch]").first();
await rainToggle.click();
await page.waitForTimeout(300);
const e4 = await exportFrame();
check("disabling rain changes the export", sha(e4.buf) !== sha(e1.buf));
await rainToggle.click();
await page.waitForTimeout(300);

// 5) Time change alters frame; returning to same time reproduces it
const timeInput = page.locator('input[aria-label="Time in seconds"]');
const t0 = await timeInput.inputValue();
await timeInput.fill("3.5"); await timeInput.press("Enter"); await page.waitForTimeout(300);
const e5 = await exportFrame();
await timeInput.fill(t0); await timeInput.press("Enter"); await page.waitForTimeout(300);
const e6 = await exportFrame();
check("different time gives different frame", sha(e5.buf) !== sha(e1.buf));
check("returning to the same time reproduces the frame exactly", sha(e6.buf) === sha(e1.buf), `${sha(e6.buf)} vs ${sha(e1.buf)}`);

// 6) Presets change the render
await page.selectOption('select[aria-label="Preset"]', "backlit-night");
await page.waitForTimeout(500);
const e7 = await exportFrame();
check("preset changes the render", sha(e7.buf) !== sha(e6.buf));
await page.screenshot({ path: path.join(outDir, "02-backlit-night.png") });

// 7) Glass preset
await page.selectOption('select[aria-label="Preset"]', "rain-on-glass");
await page.waitForTimeout(800);
const e8 = await exportFrame();
check("rain-on-glass preset renders and differs", sha(e8.buf) !== sha(e7.buf));
await page.screenshot({ path: path.join(outDir, "03-glass.png") });

// 8) Custom export with different aspect (letterbox) and oversize refusal
await page.selectOption('select[aria-label="Output Size"]', "custom");
await page.locator("label:has-text('Lock Aspect Ratio') [role=switch]").click();
await page.locator('input[aria-label="Export width"]').fill("800"); await page.keyboard.press("Enter");
await page.locator('input[aria-label="Export height"]').fill("800"); await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const e9 = await exportFrame();
const s9 = pngSize(e9.buf);
check("custom 800x800 export has requested dimensions", s9.w === 800 && s9.h === 800, `${s9.w}x${s9.h}`);
await page.locator('input[aria-label="Export width"]').fill("30000"); await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.click("text=Capture Frame");
await page.waitForTimeout(1500);
check("oversize export is refused with a message", await page.isVisible("text=Export failed"));

// 9) Landscape + portrait uploads (orientation/aspect)
await page.click("text=Reset All Effects");
await page.waitForTimeout(300);
const land = await makeImage(1600, 900, "landscape.png");
await upload(land);
check("landscape upload shows 1600 × 900", await page.isVisible("text=1600 × 900"));
await page.screenshot({ path: path.join(outDir, "04-landscape.png"), timeout: 120000 });
const port = await makeImage(900, 1600, "portrait.png");
await upload(port);
check("portrait upload shows 900 × 1600", await page.isVisible("text=900 × 1600"));
await page.screenshot({ path: path.join(outDir, "05-portrait.png"), timeout: 120000 });
await page.selectOption('select[aria-label="Output Size"]', "original");
const e10 = await exportFrame();
const s10 = pngSize(e10.buf);
check("portrait original export is 900x1600", s10.w === 900 && s10.h === 1600, `${s10.w}x${s10.h}`);

// 10) Wet surface mask painting + splash + export
await page.click("text=Wet Surfaces");
await page.waitForTimeout(200);
const wetToggle = page.locator("div:has(> span:text-is('Wet Surfaces')) [role=switch]").first();
await wetToggle.click();
await page.click("text=Edit Mask");
const canvasBox = await page.locator("canvas").boundingBox();
const cx = canvasBox.x + canvasBox.width / 2, cy = canvasBox.y + canvasBox.height * 0.75;
await page.mouse.move(cx - 150, cy); await page.mouse.down();
for (let i = 0; i <= 20; i++) await page.mouse.move(cx - 150 + i * 15, cy + Math.sin(i) * 10);
await page.mouse.up();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, "06-wet-mask-overlay.png"), timeout: 120000 });
check("undo becomes available after a stroke", await page.locator("button:text-is('Undo')").first().isEnabled());
await page.click("text=Done Painting");
await page.waitForTimeout(300);
const e11 = await exportFrame();
check("wet surface export renders", pngSize(e11.buf).w === 900);
await page.screenshot({ path: path.join(outDir, "07-wet-surface.png"), timeout: 120000 });

// 11) Save project + load project (no embedded image → prompts; with matching image → applies)
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Save Project")]);
const projPath = path.join(outDir, "project.json");
await dl.saveAs(projPath);
const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
check("project file saved with version, settings, time, masks", proj.version === 1 && proj.settings && typeof proj.time === "number" && proj.masks.wet, `time=${proj.time}`);
await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(projPath);
await page.waitForTimeout(800);
check("project applies to matching current image", await page.isVisible("text=Project restored"));

// 12) Replace image clears stale masks/depth; clean preview hides UI
await upload(land);
check("replace image works after project", await page.isVisible("text=1600 × 900"));
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
check("clean preview hides toolbar", !(await page.isVisible("text=Clean Preview")));
await page.screenshot({ path: path.join(outDir, "08-clean-preview.png"), timeout: 120000 });
await page.keyboard.press("Escape");

// Video recording is not checked here: in headless Chromium with SwiftShader WebGL, MediaRecorder yields
// empty recordings for any canvas in a page that is rendering WebGL. Smoke-test it in a real browser.

// 13) Unsupported file is reported
await page.locator('input[type=file][accept="image/jpeg,image/png,image/webp"]').first().setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
await page.waitForTimeout(500);
check("unsupported file shows an error toast", await page.isVisible("text=not a supported image"));

const bad = logs.filter((l) => !/Download the React DevTools|passive event listener|GPU stall due to ReadPixels|GL Driver Message/i.test(l));
check("no runtime errors in console", bad.length === 0, bad.slice(0, 5).join(" | ").slice(0, 1200));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
