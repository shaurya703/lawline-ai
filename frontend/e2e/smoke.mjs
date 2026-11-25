// End-to-end smoke test: drives every module of the React app in a real browser against a running API.
//
//   npm run e2e                 every check that does not call the language model
//   npm run e2e -- --llm        also the model-backed flows (spends LLM quota: about 15 calls)
//   npm run e2e -- --only=prov  only checks whose name contains "prov"
//
// Needs the API on :8000 and the dev server on :5173 (or set E2E_BASE). Uses the Chrome already installed.
// A check fails on a wrong result, an uncaught page error, a console error or an API response of 400 or above.
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE || "http://localhost:5173";
const LLM = process.argv.includes("--llm");
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).toLowerCase();
const HEADED = process.argv.includes("--headed");

const browser = await chromium.launch({ channel: "chrome", headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", e => problems.push("page error: " + String(e).slice(0, 200)));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_ABORTED/.test(m.text())) problems.push("console: " + m.text().slice(0, 200)); });
page.on("response", r => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400) problems.push(`HTTP ${r.status()} ${u.slice(u.indexOf("/api/") + 4, u.indexOf("/api/") + 80)}`); });

const main = () => page.locator("main").innerText();
const go = async (route, ms = 700) => { await page.goto(BASE + route); await page.waitForTimeout(ms); };
/** Open a route and wait for the API call it makes on load (registered first, so a fast response is not missed). */
const goFor = async (route, frag, ms = 700) => { const p = api(frag, 30000); await page.goto(BASE + route); const r = await p; await page.waitForTimeout(ms); return r; };
const api = (frag, ms = 120000) => page.waitForResponse(r => r.url().includes("/api/" + frag) && r.request().method() !== "OPTIONS", { timeout: ms });
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const json = async path => (await fetch(BASE + "/api" + path)).json();
const n = v => Number(v).toLocaleString("en-US");

const checks = [];
const check = (name, fn, opts = {}) => checks.push({ name, fn, ...opts });

// ---------------------------------------------------------------------------------------------- landing and overview
check("landing: figures match the loaded corpus and results", async () => {
  const [stats, an] = await Promise.all([json("/stats"), json("/analytics")]);
  const routed = an.ablation_ft.find(r => String(r.config).startsWith("routed") && r.task === "macro");
  await go("/");
  const text = await page.locator("body").innerText();
  for (const v of [n(stats.corpus.statutes), n(stats.corpus.cases), routed["R@5"].toFixed(3)]) expect(text.includes(v), `landing does not show ${v}`);
  expect(await overflow() === 0, "landing scrolls sideways");
  return `${n(stats.corpus.statutes)} provisions, ${n(stats.corpus.cases)} judgments, R@5 ${routed["R@5"].toFixed(3)}`;
});
check("landing: example question opens Counsel and is answered", async () => {
  await go("/");
  const first = page.locator("main button.link, button.link").first();
  const q = await first.innerText();
  const p = api("chat"); await first.click(); await page.waitForURL(/\/app\/counsel/); const r = await p;
  expect(r.status() === 200, "chat " + r.status());
  return q;
}, { llm: true });
check("overview: statistics match the API, 19 modules listed", async () => {
  const stats = await json("/stats");
  await go("/app", 1500);
  const text = await main();
  for (const v of [n(stats.corpus.total), n(stats.corpus.statutes), n(stats.corpus.cases)]) expect(text.includes(v), `overview does not show ${v}`);
  const links = await page.locator("main section[aria-labelledby=modules] a").count();
  expect(links === 19, `expected 19 module links, found ${links}`);
  return `${n(stats.corpus.total)} documents`;
});

// ---------------------------------------------------------------------------------------------- ask and learn
check("counsel: answer with citations, sources, simpler wording, follow-ups, clear", async () => {
  await go("/app");
  await page.getByLabel("Ask a legal question").first().fill("Is registration of an FIR mandatory when a cognizable offence is disclosed?");
  const p = api("chat"); await page.getByRole("button", { name: /Ask Counsel/ }).click(); const r = await p;
  expect(r.status() === 200, "chat " + r.status());
  const body = await r.json();
  expect(body.passages.length > 0 && body.passages.some(x => x.used), "no passage was cited");
  await page.getByRole("button", { name: "Copy" }).first().waitFor({ timeout: 30000 });
  const s = api("simplify"); await page.getByRole("button", { name: "Explain in simpler words" }).first().click(); expect((await s).status() === 200, "simplify failed");
  await page.getByRole("button", { name: "Clear the conversation" }).click(); await page.waitForTimeout(300);
  expect(!(await main()).includes("Explain in simpler words"), "conversation not cleared");
  return `${body.passages.filter(x => x.used).length} of ${body.passages.length} passages cited; ${body.followups.length} follow-ups`;
}, { llm: true });
check("rights guides: open a guide and step through it", async () => {
  await go("/app/rights"); await page.locator("main button").first().waitFor();
  const guides = await page.locator("main button").count();
  const p = api("rights?scenario="); await page.locator("main button").first().click(); await p; await page.waitForTimeout(400);
  const next = page.getByRole("button", { name: /Next/i }); let steps = 0;
  while (await next.count() && await next.isEnabled() && steps < 15) { await next.click(); steps++; }
  expect(steps > 0, "guide has no steps");
  return `${guides} guides, ${steps + 1} steps`;
});
check("offence lookup: results with punishment and classification", async () => {
  await go("/app/offence"); await page.getByLabel("Offence").fill("theft");
  const p = api("offence?q="); await page.getByLabel("Offence").press("Enter"); const r = await p; await page.waitForTimeout(600);
  expect(r.status() === 200, "offence " + r.status());
  const cards = await page.getByRole("button", { name: "Full text" }).count();
  expect(cards > 0, "no offence cards");
  return `${cards} provisions`;
}, { llm: true });
check("glossary: search and expand a term", async () => {
  await go("/app/glossary"); await page.getByLabel("Search the glossary").fill("bail"); await page.waitForTimeout(400);
  const rows = page.locator("main button[aria-expanded]"); expect(await rows.count() > 0, "no terms for bail");
  await rows.first().click(); await page.waitForTimeout(200);
  expect((await main()).includes("Ask Counsel for an example"), "term did not expand");
  return `${await rows.count()} terms`;
});
check("bar exam trainer: start a set and see four options", async () => {
  await go("/app/trainer"); const p = api("quiz?n=");
  await page.getByRole("button", { name: /New set|Start/i }).first().click(); expect((await p).status() === 200, "quiz failed"); await page.waitForTimeout(500);
  const opts = await page.locator("main button:not([disabled])").filter({ hasNotText: /New set|Next|Finish/ }).count();
  expect(opts >= 4, `expected 4 options, found ${opts}`);
  return `${opts} options`;
});
check("bar exam trainer: answer is marked and explained", async () => {
  const c = api("quiz/check"); await page.locator("main button:not([disabled])").filter({ hasNotText: /New set|Next|Finish/ }).first().click();
  expect((await c).status() === 200, "check failed"); await page.waitForTimeout(700);
  expect(/Correct|Incorrect|correct answer/i.test(await main()), "no verdict shown");
}, { llm: true });

// ---------------------------------------------------------------------------------------------- statutes
check("provision explorer: switching Act shows that Act's sections", async () => {
  await go("/app/provisions", 1500);
  const sel = page.locator("main select").first();
  for (const act of ["Digital Personal Data Protection Act, 2023", "Indian Partnership Act, 1932", "Constitution of India, 1949"]) {
    const p = api("provision?doc_id="); await sel.selectOption({ label: act }); await p; await page.waitForTimeout(500);
    expect(await sel.inputValue() === act, `the Act selector snapped back to ${await sel.inputValue()} after choosing ${act}`);
    expect((await main()).includes(act), `the reading pane does not show ${act}`);
  }
  return "three Acts in turn";
});
check("provision explorer: search within an Act, deep link, corpus overview", async () => {
  await go("/app/provisions?doc=" + encodeURIComponent("statute::bharatiya-nyaya-sanhita-2023::103"), 1500);
  expect(/103/.test(await main()) && /murder/i.test(await main()), "deep link did not open BNS 103");
  await page.getByPlaceholder("Title or text…").fill("theft"); await api("acts/sections?act="); await page.waitForTimeout(400);
  expect(await page.locator("main aside button").count() > 0, "search within the Act returned nothing");
  const tab = page.getByRole("tab", { name: "Acts by year" }).or(page.getByRole("button", { name: "Acts by year" })).first();
  await tab.scrollIntoViewIfNeeded(); await tab.click(); await page.waitForTimeout(1200);
  expect(await page.locator("main .js-plotly-plot").count() > 0, "corpus overview chart missing");
});
check("IPC to BNS bridge: full map filters", async () => {
  await go("/app/transition", 900);
  await page.getByRole("tab", { name: /Full map/ }).or(page.getByRole("button", { name: /Full map/ })).first().click(); await page.waitForTimeout(500);
  await page.getByLabel("Filter the map").fill("420"); await page.waitForTimeout(400);
  const rows = await page.locator("main table tbody tr").count();
  expect(rows >= 1 && /318/.test(await main()), "IPC 420 does not map to BNS 318");
  return `${rows} row`;
});
check("IPC to BNS bridge: section 302 with the differences", async () => {
  await go("/app/transition"); await page.getByPlaceholder("e.g. 302").fill("302");
  const p = api("transition?act="); await page.getByPlaceholder("e.g. 302").press("Enter"); expect((await p).status() === 200, "transition failed"); await page.waitForTimeout(900);
  expect(/103/.test(await main()), "IPC 302 does not bridge to BNS 103");
}, { llm: true });
check("compare provisions: a preset comparison", async () => {
  await go("/app/compare", 900);
  const p = api("compare"); await page.locator("main button").filter({ hasText: /vs|→/ }).first().click(); expect((await p).status() === 200, "compare failed"); await page.waitForTimeout(900);
  expect(await page.locator("main table tbody tr").count() > 0, "no comparison matrix");
}, { llm: true });
check("knowledge graph: find a judgment added in v2, centre on it, list view", async () => {
  await goFor("/app/graph", "kg/neighborhood?node=");
  await page.getByPlaceholder("Concept, section, case…").fill("Arnesh Kumar"); await api("kg/search?q=", 20000); await page.waitForTimeout(500);
  const hit = page.locator("main button").filter({ hasText: /Arnesh Kumar/ }).first(); expect(await hit.count() > 0, "Arnesh Kumar is not in the graph");
  const p = api("kg/neighborhood?node=", 30000); await hit.click(); expect((await p).status() === 200, "neighbourhood failed"); await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Show as a list/ }).click(); await page.waitForTimeout(400);
  const rows = await page.locator("main table tbody tr, main li").count(); expect(rows > 0, "list view is empty");
  return `${rows} links`;
});
check("limitation clock: periods, filter, another date", async () => {
  await goFor("/app/limitation", "limitation?start=");
  const all = await page.locator("main table tbody tr").count();
  await page.getByPlaceholder(/cheque, appeal/).fill("cheque"); await page.waitForTimeout(400);
  const some = await page.locator("main table tbody tr").count();
  expect(all > some && some > 0, `filter did not narrow the list (${all} -> ${some})`);
  const p = api("limitation?start=", 20000); await page.locator("main input[type=date]").fill("2025-01-15"); expect((await p).status() === 200, "date change failed");
  return `${all} matters`;
});

// ---------------------------------------------------------------------------------------------- documents
const FIR = "FIR No. 212/2024, P.S. Koramangala. The complainant states that on 4 March 2024 the accused, her husband, and his mother demanded Rs 5 lakh as additional dowry, beat her and threw her out of the matrimonial home. Offences under Sections 498A and 323 of the Indian Penal Code and Sections 3 and 4 of the Dowry Prohibition Act, 1961 are alleged.";
check("document analyzer: finds the provisions a document relies on", async () => {
  await go("/app/analyze"); await page.locator("main textarea").first().fill(FIR);
  const p = api("analyze"); await page.getByRole("button", { name: /Scan provi/ }).click(); expect((await p).status() === 200, "analyze failed"); await page.waitForTimeout(700);
  const text = await main(); expect(/498A/.test(text) && /Dowry Prohibition/.test(text), "did not find 498A and the Dowry Prohibition Act");
});
check("document analyzer: writes a brief", async () => {
  const p = api("analyze"); await page.locator("main button").filter({ hasText: /brief/i }).first().click(); expect((await p).status() === 200, "brief failed"); await page.waitForTimeout(900);
  expect(await page.getByRole("button", { name: /Copy/ }).count() > 0, "no brief shown");
}, { llm: true });
for (const [name, route, endpoint, marker] of [["judgment summarizer", "/app/summarize", "summarize", /Holding|Ratio/i], ["case timeline", "/app/timeline", "timeline", /20\d\d/], ["argument arena", "/app/arena", "argue", /bench/i]])
  check(`${name}: sample input`, async () => {
    await go(route); const p = api(endpoint); await page.getByRole("button", { name: /sample/i }).click();
    expect((await p).status() === 200, endpoint + " failed"); await page.waitForTimeout(900);
    expect(marker.test(await main()), "result is missing its main section");
  }, { llm: true });
check("citation verifier: real and invented sections, including new Acts", async () => {
  await go("/app/verify");
  await page.locator("main textarea").first().fill("Consent is governed by Section 6 of the Digital Personal Data Protection Act, 2023 and Section 4 of the Indian Partnership Act, 1932. The accused relies on Section 999 of the Indian Penal Code.");
  const p = api("verify"); await page.getByRole("button", { name: /Verify citations/ }).click(); const r = await p; expect(r.status() === 200, "verify failed");
  const found = (await r.json()).citations.map(c => [c.section, c.found]);
  expect(JSON.stringify(found) === JSON.stringify([["6", true], ["4", true], ["999", false]]), "unexpected verdicts: " + JSON.stringify(found));
  return "2 real, 1 invented";
});
check("drafting studio: templates load", async () => {
  expect((await goFor("/app/draft", "draft/templates")).status() === 200, "templates failed");
  const options = await page.locator("main select").first().locator("option").count(); expect(options > 3, "no templates");
  return `${options} templates`;
});
check("drafting studio: writes a draft", async () => {
  const fields = page.locator("main input, main textarea");
  for (let i = 0; i < await fields.count(); i++) if (await fields.nth(i).isEditable()) await fields.nth(i).fill(i === 0 ? "Asha Menon" : "Cheque no. 004521 for Rs 2,40,000 dated 10 January 2025 was returned unpaid on 14 January 2025 for insufficient funds.");
  const p = api("draft"); await page.getByRole("button", { name: /Write the draft/ }).click(); expect((await p).status() === 200, "draft failed"); await page.waitForTimeout(900);
  expect(await page.getByRole("button", { name: /Copy/ }).count() > 0, "no draft shown");
}, { llm: true });

// ---------------------------------------------------------------------------------------------- evaluation
check("retrieval lab: traces a question through every retriever", async () => {
  await go("/app/lab"); await page.locator("main form input").first().fill("Can police arrest without a warrant for an offence punishable with up to seven years?");
  const p = api("retrieve/trace"); await page.getByRole("button", { name: "Trace" }).click(); expect((await p).status() === 200, "trace failed"); await page.waitForTimeout(1500);
  const text = await main(); expect(/Dense/.test(text) && /BM25/.test(text) && /Graph/.test(text), "a retriever list is missing");
  expect(await page.locator("main .js-plotly-plot").count() >= 1, "charts missing");
});
for (const v of ["ablation", "landscape", "fusion", "chunking", "finetune", "rerank", "latency", "quality", "corpus", "raw"])
  check(`analytics: ${v} view renders real numbers`, async () => {
    await go("/app/analytics" + (v === "ablation" ? "" : "?view=" + v), 400);
    await page.locator("main .js-plotly-plot, main table").first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1200);
    const text = await main(); const bad = text.match(/NaN|undefined|Infinity|\[object Object\]/);
    expect(!bad, `"${bad}" on screen`);
    const toggle = page.getByRole("button", { name: "View as table" }).first();
    if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(300); expect(await page.locator("main table tbody tr").count() > 0, "table view is empty"); }
    expect(await overflow() === 0, "page scrolls sideways");
  });
check("methodology: corpus table adds up", async () => {
  const stats = await json("/stats");
  await go("/app/methodology", 1200);
  const text = await main(); expect(text.includes(n(stats.corpus.total)) && !/NaN|undefined/.test(text), "corpus total missing or malformed");
});

// ---------------------------------------------------------------------------------------------- workspace and shell
check("case files: save, annotate, survive a reload, remove", async () => {
  await page.evaluate(() => localStorage.removeItem("lawline.files"));
  await go("/app/rights"); const p = api("rights?scenario="); await page.locator("main button").first().click(); await p; await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Save to case file" }).first().click(); await page.waitForTimeout(300);
  await go("/app/files");
  const rows = page.locator("main button[aria-expanded]"); expect(await rows.count() === 1, `expected 1 saved item, found ${await rows.count()}`);
  await rows.first().click(); await page.getByPlaceholder("Add a note for this item…").first().fill("check with the client");
  await page.reload(); await page.waitForTimeout(700);
  await page.locator("main button[aria-expanded]").first().click();
  expect(await page.getByPlaceholder("Add a note for this item…").first().inputValue() === "check with the client", "note was lost on reload");
  await page.getByRole("button", { name: "Remove from case file" }).first().click(); await page.waitForTimeout(200);
  expect(await page.locator("main button[aria-expanded]").count() === 0, "item was not removed");
});
check("settings: accent persists across a reload", async () => {
  await go("/app/settings"); await page.getByRole("radio").nth(1).click();
  const accent = await page.evaluate(() => document.documentElement.dataset.accent);
  await page.reload(); await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.dataset.accent) === accent && accent !== "oxblood", "accent did not persist");
  await page.getByRole("radio").first().click();
});
check("shell: palette opens a module by name, shortcuts, case-file drawer", async () => {
  await go("/app");
  await page.keyboard.press("Meta+k"); await page.getByRole("dialog").waitFor();
  await page.keyboard.type("limitation"); await page.waitForTimeout(200); await page.keyboard.press("Enter"); await page.waitForURL(/\/app\/limitation/, { timeout: 5000 });
  await page.locator("h1").first().click();
  await page.keyboard.press("g"); await page.keyboard.press("p"); await page.waitForURL(/\/app\/provisions/, { timeout: 5000 });
  await page.keyboard.press("Shift+?"); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Case file/ }).first().click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
});
check("phone width: no page scrolls sideways", async () => {
  await page.evaluate(() => localStorage.setItem("lawline.activity", JSON.stringify({ list: [{ at: Date.now(), kind: "ask", text: "Can police arrest without a warrant for an offence punishable with imprisonment of up to seven years under the code?", to: "/app/counsel" }] })));
  await page.setViewportSize({ width: 390, height: 844 });
  const wide = [];
  for (const r of ["/", "/app", "/app/counsel", "/app/rights", "/app/offence", "/app/glossary", "/app/trainer", "/app/provisions", "/app/transition", "/app/compare", "/app/graph", "/app/limitation", "/app/analyze", "/app/summarize", "/app/timeline", "/app/arena", "/app/verify", "/app/draft", "/app/lab", "/app/analytics?view=corpus", "/app/methodology", "/app/files", "/app/settings"]) {
    await go(r, 1300); const o = await overflow(); if (o > 0) wide.push(`${r} +${o}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(!wide.length, wide.join(", "));
  return "23 routes";
});

// ---------------------------------------------------------------------------------------------- run
let failed = 0, skipped = 0;
for (const c of checks) {
  if (ONLY && !c.name.toLowerCase().includes(ONLY)) continue;
  if (c.llm && !LLM) { skipped++; continue; }
  problems.length = 0; const t = Date.now(); let note = "", err = "";
  try { note = (await c.fn()) || ""; } catch (e) { err = String(e.message || e).split("\n")[0].slice(0, 260); }
  if (!err && problems.length) err = problems.slice(0, 3).join(" | ");
  if (err) failed++;
  console.log(`${err ? "FAIL" : "ok  "}  ${c.name}${note ? "  (" + note + ")" : ""}${err ? "\n      " + err : ""}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
}
await browser.close();
console.log(`\n${failed ? failed + " failed" : "all passed"}${skipped ? `; ${skipped} model-backed checks skipped (run with --llm)` : ""}`);
process.exit(failed ? 1 : 0);
