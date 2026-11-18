// AgentStackd read-only MCP server (streamable HTTP, JSON responses, stateless). Added 2026-11-18.
// Data is generated at build time by mcp_build.py into api/_lib/data.json. No auth, no writes, no user data stored.
"use strict";
const DATA = require("./_lib/data.json");
const SITE = DATA.site;
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "agentstackd", title: "AgentStackd directory", version: "0.1.0", websiteUrl: SITE };
const MAX_BODY = 16 * 1024, MAX_Q = 200, MAX_SLUG = 100, RATE = 60, WINDOW_MS = 60 * 1000;
const BY_SLUG = new Map(DATA.tools.map(t => [t.slug, t]));
const CATS = DATA.categories.map(c => c.slug);
const PRICE_TIERS = { free: ["Free", "Open source"], freemium: ["Free", "Open source", "Freemium"], paid: ["Free", "Open source", "Freemium", "Paid"] };

// Best-effort per-instance rate limit (in memory; resets on cold start, not shared across instances).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  h.n++; return h.n > RATE;
}

class ArgError extends Error {}
const str = (v, max, name, required) => {
  if (v === undefined || v === null || v === "") { if (required) throw new ArgError(`'${name}' is required`); return undefined; }
  if (typeof v !== "string") throw new ArgError(`'${name}' must be a string`);
  if (v.length > max) throw new ArgError(`'${name}' must be at most ${max} characters`);
  return v.trim();
};
const norm = s => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const slugify = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function findTool(key) {
  const s = slugify(key);
  if (BY_SLUG.has(s)) return BY_SLUG.get(s);
  return DATA.tools.find(t => slugify(t.name) === s) || null;
}
const summary = t => ({ slug: t.slug, name: t.name, category: t.category_name, pricing_model: t.pricing_model, description: t.description, page_url: t.page_url, website: t.website });
const RO = { readOnlyHint: true, openWorldHint: false };

const TOOLS = [
  { name: "search_tools", title: "Search AI tools",
    description: "Search the AgentStackd directory of hand-reviewed AI agents and automation tools by keyword. Optional filters: category slug and max_price tier. Returns matching tools with pricing model, description and the agentstackd.com page URL.",
    inputSchema: { type: "object", properties: {
      query: { type: "string", maxLength: MAX_Q, description: "Keywords, e.g. 'coding agent', 'web research', 'self-hosted automation'." },
      category: { type: "string", enum: CATS, description: "Optional category slug (see list_categories)." },
      max_price: { type: "string", enum: ["free", "freemium", "paid"], description: "Optional pricing ceiling: 'free' = Free or Open source only; 'freemium' = also tools with a free plan; 'paid' = everything. The directory records pricing models, not dollar amounts." },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Max results (default 10)." } }, required: ["query"], additionalProperties: false },
    annotations: RO },
  { name: "get_tool", title: "Get tool details",
    description: "Get one tool's AgentStackd listing: pricing model, description, pros, limitations, vendor sources (with the date they were checked), related comparisons and the agentstackd.com page URL.",
    inputSchema: { type: "object", properties: { slug: { type: "string", maxLength: MAX_SLUG, description: "Tool slug (e.g. 'cursor', 'claude-code') or exact tool name." } }, required: ["slug"], additionalProperties: false },
    annotations: RO },
  { name: "compare_tools", title: "Compare tools",
    description: "Compare 2 or 3 tools side by side: category, pricing model, pros, limitations and sources, plus any AgentStackd head-to-head comparison page that covers them.",
    inputSchema: { type: "object", properties: { slugs: { type: "array", items: { type: "string", maxLength: MAX_SLUG }, minItems: 2, maxItems: 3, description: "2 or 3 tool slugs or names." } }, required: ["slugs"], additionalProperties: false },
    annotations: RO },
  { name: "list_categories", title: "List categories",
    description: "List AgentStackd categories with descriptions, tool counts and page URLs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO },
  { name: "new_releases", title: "New releases",
    description: "Recently released AI tools added to AgentStackd, with the vendor's release date and page URL.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO },
];

const STOP = new Set(["the","for","and","a","an","of","to","with","tool","tools","best","in","on","your","that","this","or","by","as"]);
const GENERIC = new Set(["agent","ai"]);
const CAT_GENERIC = new Set(["agent","builder","ai","build"]);
const IRR = {
  coding:"code", codes:"code", coder:"code", coded:"code",
  agentic:"agent", agents:"agent",
  editors:"editor",
  workflows:"workflow",
  automating:"automat", automated:"automat", automation:"automat", automate:"automat",
  frameworks:"framework",
  assistants:"assistant",
  builder:"build", builders:"build", building:"build", builds:"build",
  terminals:"terminal",
  apps:"app"
};
const SYN = {
  code:["coding","coder"], editor:["ide"], ide:["editor"],
  terminal:["cli","shell"], cli:["terminal","shell"], shell:["terminal","cli"],
  automat:["workflow","automation","automate"], workflow:["automat","automation","automate"],
  framework:[], assistant:[], builder:[], build:[],
  nocode:["appbuilder"], appbuilder:["nocode"]
};
const CAT_HINTS = {
  coding:["code","editor","ide","terminal","cli"],
  automation:["automat","workflow","framework"],
  research:["research","paper","literature"],
  sales:["sales","sdr","outbound","lead"],
  support:["support","helpdesk"],
  content:["content","video","voice","avatar","podcast"],
  assistants:["assistant"]
};
const PHRASES = [
  ["coding-agent", /\b(coding\s+agents?|code\s+agents?|agentic\s+cod)/],
  ["code-editor", /\b(code\s+editors?|coding\s+editors?|agentic\s+ide|ai[-\s]?first\s+code\s+editor)\b/],
  ["browser-agent", /\b(browser\s+agents?|cloud\s+chrome|computer[-\s]?use)\b/],
  ["workflow-automation", /\b(workflow\s+automation|visual\s+workflow|no[-\s]?code\s+automation)\b/],
  ["nocode", /\b(without\s+(a\s+)?(developer|code)|no[-\s]?code|app\s*builders?|chat[-\s]?to[-\s]?build)\b/],
  ["app-build", /\b(build(?:s|ing)?(?:\s+\w+){0,3}\s+(?:(?:a|an|web|full)\s+)+apps?|app\s*builders?|chat[-\s]?to[-\s]?build)\b/],
  ["agent-framework", /\b(agent\s+frameworks?|frameworks?\s+for\s+.{0,40}\bagents?\b|frameworks?\s+for\s+orchestrat)/],
  ["coding-assistant", /\b(coding\s+assistants?|code\s+assistants?|pair\s+programmers?)\b/],
  ["terminal-coding", /\b(terminal\s+coding|in(?:side)?\s+your\s+terminal|for\s+your\s+terminal|cli\s+\w+\s+agent|cli\s+software)\b/]
];
const WEAK_BROWSER = /\b(in[-\s]browser|in\s+the\s+browser|from\s+the\s+browser|and\s+the\s+browser|in\s+a\s+browser)\b/;
const STRONG_BROWSER = /\b(cloud chrome|own browser|computer[-\s]?use|browser for ai|browser tab|hosted browser)\b/;

function stem(w) {
  if (IRR[w]) return IRR[w];
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("es") && w.length > 4 && !w.endsWith("ss")) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}
function expand(term) {
  const s = stem(term), out = new Set([term, s]);
  for (const x of [...(SYN[term] || []), ...(SYN[s] || [])]) { out.add(x); out.add(stem(x)); }
  return out;
}
function tokenize(s) {
  s = (s || "").toLowerCase().normalize("NFKD").replace(/no-code/g, " nocode ").replace(/in-browser/g, " inbrowser ");
  return s.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w && w !== "s");
}
function phrasesIn(text) {
  const t = (text || "").toLowerCase(), out = new Set();
  for (const [lab, rx] of PHRASES) if (rx.test(t)) out.add(lab);
  return out;
}
function fieldTokens(text) { return tokenize(text).map(stem); }
function setOf(arr) { return new Set(arr); }

const INDEX = DATA.tools.map(t => {
  const nameT = fieldTokens(t.name);
  const catT = fieldTokens(t.category_name + " " + t.category).filter(x => !CAT_GENERIC.has(x));
  const tagT = fieldTokens(t.best_for || "");
  const descT = fieldTokens(t.description);
  const extraT = fieldTokens([...(t.pros || []), ...(t.limitations || [])].join(" "));
  const blob = [t.name, t.best_for || "", t.description].join(" ");
  return {
    t, nameS: setOf(nameT), catS: setOf(catT), tagS: setOf(tagT), descS: setOf(descT), extraS: setOf(extraT),
    lead: descT.slice(0, 4), phrases: phrasesIn(blob),
    weakBrowser: WEAK_BROWSER.test((t.best_for || "") + " " + t.description),
    strongBrowser: nameT.includes("browser") || STRONG_BROWSER.test(blob.toLowerCase())
  };
});
const DF = new Map();
for (const rec of INDEX) {
  const vocab = new Set([...rec.nameS, ...rec.catS, ...rec.tagS, ...rec.descS]);
  for (const w of vocab) DF.set(w, (DF.get(w) || 0) + 1);
}
const idf = s => Math.log((INDEX.length + 1) / ((DF.get(s) || 0) + 1)) + 1;
const fieldHit = (ex, set) => { for (const x of ex) if (set.has(x)) return true; return false; };

function inferCategory(qStems, qPhrases) {
  if (qPhrases.has("nocode") || qPhrases.has("app-build")) return null;
  const scores = {};
  for (const [cat, hints] of Object.entries(CAT_HINTS)) {
    let sc = 0; for (const h of hints) if (qStems.has(h)) sc++;
    if (sc) scores[cat] = sc;
  }
  const keys = Object.keys(scores);
  if (!keys.length) return null;
  if (scores.coding && scores.assistants && qStems.has("code")) return "coding";
  return keys.sort((a, b) => scores[b] - scores[a] || a.localeCompare(b))[0];
}

function searchTools(a) {
  const q = str(a.query, MAX_Q, "query", true);
  const cat = str(a.category, 40, "category");
  if (cat && !CATS.includes(cat)) throw new ArgError(`unknown category '${cat}'. Valid: ${CATS.join(", ")}`);
  const mp = str(a.max_price, 20, "max_price");
  if (mp && !PRICE_TIERS[mp.toLowerCase()]) throw new ArgError("max_price must be 'free', 'freemium' or 'paid'");
  const limit = a.limit === undefined ? 10 : Number(a.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new ArgError("limit must be an integer from 1 to 25");
  const allowed = mp ? PRICE_TIERS[mp.toLowerCase()] : null;

  const qLow = q.toLowerCase();
  const qPhrases = phrasesIn(qLow);
  if (/\bwithout\s+code\b|\bno\s+code\b|\bbuild\s+an\s+app\b/.test(qLow)) {
    qPhrases.add("nocode");
    if (/\bbuild\s+an\s+app\b/.test(qLow)) qPhrases.add("app-build");
  }
  const toks = tokenize(q);
  const terms = [];
  const seen = new Set();
  for (const w of toks) {
    if (STOP.has(w) || w.length <= 1) continue;
    const s = stem(w);
    if (seen.has(s) || seen.has(w)) continue;
    if (qPhrases.has("nocode") && (s === "code" || s === "without" || s === "no" || s === "developer")) continue;
    if (qPhrases.has("app-build") && s === "app") continue;
    seen.add(s);
    terms.push({ w, s, ex: expand(w) });
  }
  const wantsFree = terms.some(t => t.s === "free");
  const used = terms.filter(t => t.s !== "free");
  const qStems = new Set(used.map(t => t.s));
  const inferred = inferCategory(qStems, qPhrases);
  const distinctive = [];
  for (const t of used) {
    if (GENERIC.has(t.s)) continue;
    if (idf(t.s) >= 2.8 || ["editor","ide","terminal","cli","framework","browser","nocode","appbuilder"].includes(t.s))
      distinctive.push(t);
  }
  const distStems = new Set(distinctive.map(t => t.s));

  const scored = [];
  for (const rec of INDEX) {
    const t = rec.t;
    if (cat && t.category !== cat) continue;
    if (allowed && !allowed.includes(t.pricing_model)) continue;
    let score = 0;
    const hit = new Set(), strong = new Set();

    for (const term of used) {
      const generic = GENERIC.has(term.s);
      let wgt = generic ? 0.45 : 1;
      if (!generic) wgt *= 0.75 + 0.25 * Math.min(idf(term.s) / 3.5, 1.6);
      let m = 0;
      if (fieldHit(term.ex, rec.nameS)) { m += 10; strong.add(term.s); }
      if (fieldHit(term.ex, rec.tagS)) { m += 6; strong.add(term.s); }
      if (fieldHit(term.ex, rec.catS)) { m += generic ? 1.5 : 7; if (!generic) strong.add(term.s); }
      if (term.s === "browser" || term.ex.has("browser")) {
        if (rec.weakBrowser && !rec.strongBrowser && !fieldHit(term.ex, rec.nameS)) {
          if (fieldHit(term.ex, rec.descS)) m += 1;
        } else if (fieldHit(term.ex, rec.descS)) { m += 3; strong.add(term.s); }
      } else if (fieldHit(term.ex, rec.descS)) {
        m += 3; if (!generic) strong.add(term.s);
      }
      if (fieldHit(term.ex, rec.extraS)) m += 1;
      if (m) { hit.add(term.s); score += m * wgt; }
    }

    for (const term of used) {
      if (GENERIC.has(term.s) || !distStems.has(term.s)) continue;
      if ([...term.ex].some(x => rec.lead.includes(x))) score += 5;
    }

    if (qPhrases.has("coding-agent") && rec.phrases.has("coding-agent")) score += 5;
    if (qPhrases.has("code-editor") && rec.phrases.has("code-editor")) score += 10;
    if (qPhrases.has("browser-agent") && (rec.phrases.has("browser-agent") || rec.strongBrowser || rec.nameS.has("browser"))) score += 10;
    if (qPhrases.has("workflow-automation") && rec.phrases.has("workflow-automation")) score += 6;
    if (qPhrases.has("nocode") && (rec.phrases.has("nocode") || rec.descS.has("nocode") || rec.tagS.has("nocode") || rec.descS.has("appbuilder") || rec.tagS.has("appbuilder"))) score += 12;
    if (qPhrases.has("app-build") && rec.phrases.has("app-build")) score += 8;
    if (qPhrases.has("agent-framework") && rec.phrases.has("agent-framework")) score += 12;
    if (qPhrases.has("coding-assistant") && (rec.phrases.has("coding-assistant") || rec.phrases.has("coding-agent"))) score += 6;
    if (qPhrases.has("terminal-coding") && rec.phrases.has("terminal-coding")) score += 10;
    if (qStems.has("terminal") && rec.phrases.has("terminal-coding") && !qPhrases.has("terminal-coding")) score += 6;

    if (inferred === "coding" && qStems.has("assistant") && t.category === "coding") {
      if (!hit.has("assistant")) { hit.add("assistant"); strong.add("assistant"); score += 4; }
    }
    if (inferred && t.category === inferred) score += 6;
    if (used.length && used.every(term => hit.has(term.s) || GENERIC.has(term.s))) score += 4;

    for (const term of distinctive) {
      if (term.s === "assistant" && inferred === "coding" && t.category === "coding") continue;
      if (term.s === "nocode" || term.s === "appbuilder") {
        if (rec.phrases.has("nocode") || rec.phrases.has("app-build") || rec.descS.has("nocode") || rec.descS.has("appbuilder") || rec.tagS.has("nocode")) continue;
      }
      let matched = strong.has(term.s) || fieldHit(term.ex, rec.nameS) || fieldHit(term.ex, rec.tagS) || fieldHit(term.ex, rec.catS) || fieldHit(term.ex, rec.descS);
      if (term.s === "browser") matched = rec.strongBrowser || rec.nameS.has("browser") || strong.has(term.s);
      if (!matched) score -= 14;
    }

    if (wantsFree) {
      if (t.pricing_model === "Free" || t.pricing_model === "Open source") score += 16;
      else if (t.pricing_model === "Freemium") score += 3;
      else if (t.pricing_model === "Paid") score -= 18;
    }

    if (score > 0) {
      if (t.comparisons || t.recommended_in) score += 2;
      const qn = qLow.replace(/[^a-z0-9]+/g, " ").trim();
      const nn = t.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (qn === nn) score += 20;
      const top = t.top3, rising = t.rising;
      if (top && (!inferred || inferred === top.category || inferred === t.category)) score += 6;
      if (rising && (!inferred || inferred === rising.category || inferred === t.category)) score += 2;
    }
    if (score > 0) scored.push([score, t]);
  }
  scored.sort((x, y) => y[0] - x[0] || x[1].name.localeCompare(y[1].name));
  return { query: q, filters: { category: cat || null, max_price: mp || null }, total_matches: scored.length,
    results: scored.slice(0, limit).map(([, t]) => summary(t)), more: `Browse all ${DATA.tools.length} tools at ${SITE}/` };
}

function getTool(a) {
  const key = str(a.slug, MAX_SLUG, "slug", true);
  const t = findTool(key);
  if (!t) throw new ArgError(`no tool found for '${key}'. Use search_tools to find the slug.`);
  return { ...t, disclaimer: "Plans and prices change; confirm on the vendor's site." };
}
function compareTools(a) {
  if (!Array.isArray(a.slugs) || a.slugs.length < 2 || a.slugs.length > 3) throw new ArgError("'slugs' must be an array of 2 or 3 tool slugs");
  const ts = a.slugs.map((s, i) => { const k = str(s, MAX_SLUG, `slugs[${i}]`, true); const t = findTool(k); if (!t) throw new ArgError(`no tool found for '${k}'`); return t; });
  const names = ts.map(t => t.name), pages = new Map();
  for (const t of ts) for (const c of t.comparisons || []) {
    const covered = names.filter(n => c.title.replace(" (2026)", "").split(" vs ").map(x => x.trim()).includes(n));
    if (covered.length >= 2) pages.set(c.url, c);
  }
  return { tools: ts.map(t => ({ slug: t.slug, name: t.name, category: t.category_name, pricing_model: t.pricing_model, description: t.description,
    best_for: t.best_for || null, pros: t.pros || [], limitations: t.limitations || [], sources: t.sources || [], sources_checked: t.sources_checked || null, page_url: t.page_url })),
    head_to_head_pages: [...pages.values()], disclaimer: "Plans and prices change; confirm on each vendor's site." };
}
const listCategories = () => ({ categories: DATA.categories, all_tools_url: `${SITE}/` });
const newReleases = () => ({ added_to_agentstackd: DATA.new_added, tools: DATA.new_releases.map(n => ({ ...summary(BY_SLUG.get(n.slug)), released: n.released })) });
const HANDLERS = { search_tools: searchTools, get_tool: getTool, compare_tools: compareTools, list_categories: listCategories, new_releases: newReleases };

function rpc(msg) {
  const isObj = msg && typeof msg === "object" && !Array.isArray(msg);
  if (!isObj || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return { err: [-32600, "Invalid Request"], id: isObj && msg.id !== undefined ? msg.id : null };
  const { method, id } = msg; const params = msg.params || {};
  if (id === undefined) return { notification: true }; // notifications/initialized etc.: accepted, no response body
  switch (method) {
    case "initialize": {
      const v = SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0];
      return { id, result: { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
        instructions: `Read-only search over the AgentStackd directory (${DATA.tools.length} hand-reviewed AI agents and tools). Cite page_url in answers. Pricing data is the pricing model plus listed limitations; confirm current prices on the vendor's site.` } };
    }
    case "ping": return { id, result: {} };
    case "tools/list": return { id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name, args = params.arguments || {};
      if (!HANDLERS[name]) return { id, err: [-32602, `Unknown tool: ${String(name).slice(0, 60)}`] };
      if (typeof args !== "object" || Array.isArray(args)) return { id, err: [-32602, "arguments must be an object"] };
      try {
        const out = HANDLERS[name](args);
        return { id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out, isError: false } };
      } catch (e) {
        if (e instanceof ArgError) return { id, result: { content: [{ type: "text", text: "Error: " + e.message }], isError: true } };
        return { id, err: [-32603, "Internal error"] };
      }
    }
    default: return { id, err: [-32601, `Method not found: ${method.slice(0, 60)}`] };
  }
}

function send(res, status, obj, cache) {
  res.statusCode = status;
  res.setHeader("Cache-Control", cache || "no-store");
  if (obj === null) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return send(res, 204, null, "public, max-age=86400");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(res, 405, { name: "AgentStackd MCP server", transport: "streamable-http (POST JSON-RPC 2.0)", endpoint: `${SITE}/api/mcp`, docs: `${SITE}/mcp/` }, "public, max-age=3600");
  }
  const ip = String(req.headers["x-real-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0] || (req.socket && req.socket.remoteAddress) || "unknown").trim();
  if (limited(ip)) { res.setHeader("Retry-After", "60"); return send(res, 429, rpcErr(null, -32000, "Rate limit exceeded (60 requests per minute). Try again shortly.")); }
  if (Number(req.headers["content-length"] || 0) > MAX_BODY) return send(res, 413, rpcErr(null, -32600, "Request too large"));
  let msg;
  try {
    // Vercel's Node helpers may have parsed the body already; the getter throws on invalid JSON.
    let b; try { b = req.body; } catch (e) { return send(res, 400, rpcErr(null, -32700, "Parse error")); }
    if (b !== undefined && b !== null && typeof b === "object" && !Buffer.isBuffer(b)) msg = b;
    else {
      let raw;
      if (typeof b === "string" || Buffer.isBuffer(b)) raw = String(b);
      else { try { raw = await readRaw(req); } catch (e) { return send(res, 413, rpcErr(null, -32600, "Request too large")); } }
      if (raw.length > MAX_BODY) return send(res, 413, rpcErr(null, -32600, "Request too large"));
      msg = JSON.parse(raw);
    }
  } catch (e) { return send(res, 400, rpcErr(null, -32700, "Parse error")); }
  if (Array.isArray(msg)) return send(res, 400, rpcErr(null, -32600, "Batch requests are not supported"));
  const r = rpc(msg);
  if (r.notification) return send(res, 202, null);
  if (r.err) return send(res, r.err[0] === -32600 ? 400 : 200, rpcErr(r.id === undefined ? null : r.id, r.err[0], r.err[1]));
  return send(res, 200, { jsonrpc: "2.0", id: r.id, result: r.result });
}
module.exports = handler;
module.exports.searchTools = searchTools;

