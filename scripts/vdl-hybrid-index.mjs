#!/usr/bin/env node
/**
 * vdl-hybrid-index — build Fuse corpus + semantic vectors for HybridSearch.
 *
 * Usage:
 *   vdl-hybrid-index --config indexer.config.json
 *   vdl-hybrid-index --site https://example.com --nav ./src/nav.ts --out ./public/search
 *   pnpm index   (legacy alias via package.json)
 *
 * Config JSON shape:
 * {
 *   "site": "https://vd3.vanduo.dev",
 *   "navPath": "../vd3-docs/src/nav.ts",
 *   "navUrl": "https://raw.githubusercontent.com/.../nav.ts",
 *   "outDir": "./public/search",
 *   "preset": "embeddinggemma",
 *   "fetchConcurrency": 6,
 *   "contentSelector": "doc-content"
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EMBEDDING_PRESETS,
  buildEmbedInput,
} from './lib/embedding-presets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const USER_AGENT = 'vdl-hybrid-index/0.2.0';

function parseArgs(argv) {
  const args = { config: null, site: null, nav: null, out: null, preset: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' || arg === '-c') args.config = argv[++i];
    else if (arg === '--site') args.site = argv[++i];
    else if (arg === '--nav') args.nav = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--preset') args.preset = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function loadConfig(args) {
  let fileConfig = {};
  if (args.config) {
    const configPath = path.resolve(process.cwd(), args.config);
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {
    site: args.site || fileConfig.site || process.env.VDL_SITE || process.env.VD3_DOCS_SITE || 'https://vanduo-oss.github.io/vd3-docs',
    navPath: args.nav || fileConfig.navPath || process.env.VDL_NAV_PATH || process.env.VD3_DOCS_PATH || null,
    navUrl: fileConfig.navUrl || process.env.VDL_NAV_URL || process.env.VD3_DOCS_NAV_URL || 'https://raw.githubusercontent.com/vanduo-oss/vd3-docs/main/src/nav.ts',
    outDir: args.out || fileConfig.outDir || path.join(PROJECT_ROOT, 'data'),
    preset: args.preset || fileConfig.preset || process.env.VDL_PRESET || 'embeddinggemma',
    fetchConcurrency: Number(fileConfig.fetchConcurrency || process.env.VDL_FETCH_CONCURRENCY || process.env.VD3_DOCS_FETCH_CONCURRENCY || 6),
    contentSelector: fileConfig.contentSelector || 'doc-content',
  };
}

function printHelp() {
  console.log(`vdl-hybrid-index — build search-index.json + vectors.json

Options:
  --config, -c   JSON config file
  --site         Base URL to crawl (default: VD3_DOCS_SITE env or vd3-docs GH pages)
  --nav          Local nav.ts path (or set VD3_DOCS_PATH to repo root)
  --out          Output directory (default: ./data)
  --preset       embeddinggemma | minilm | e5 (default: embeddinggemma)
  --help, -h     Show this help

Env: VDL_SITE, VDL_NAV_PATH, VDL_NAV_URL, VDL_PRESET, VDL_FETCH_CONCURRENCY
`);
}

// ── Text helpers ───────────────────────────────────────────────────────

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function extractRegion(html, className) {
  const re = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*)$`, 'i');
  const m = html.match(re);
  if (!m) return '';
  let depth = 1;
  const body = m[1];
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('<div', i)) {
      const end = body.indexOf('>', i);
      if (end === -1) break;
      if (!body.startsWith('<div/', i)) depth++;
      i = end;
    } else if (body.startsWith('</div>', i)) {
      depth--;
      if (depth === 0) return body.slice(0, i);
      i += 5;
    }
  }
  return body;
}

function extractMainContent(html, contentSelector) {
  const docContent = extractRegion(html, contentSelector);
  if (docContent) return docContent;
  const mainMatch = html.match(/<main[^>]*id="main-content"[^>]*>([\s\S]*?)<\/main>/i);
  if (!mainMatch) return '';
  return mainMatch[1].replace(
    /<aside[^>]*class="[^"]*\bdoc-sidebar\b[^"]*"[\s\S]*?<\/aside>/gi,
    ' ',
  );
}

function cleanDocHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*\bvd-code-snippet\b[^"]*"[\s\S]*?<\/div>/gi, ' ')
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, ' ')
    .replace(/\b(View Code|Customize live|Copy|HTML|CSS|Vue)\b/gi, ' ');
}

function extractHeadings(html) {
  const headings = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2]).trim();
    if (text && text.length < 160) headings.push(text);
  }
  return [...new Set(headings)];
}

function extractParagraphs(html) {
  const texts = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text && text.length > 15) texts.push(text);
  }
  return texts;
}

function extractClasses(html) {
  const classes = [];
  const re = /<td>\s*<code>([\s\S]*?)<\/code>\s*<\/td>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text && (text.startsWith('.vd-') || text.startsWith(':'))) classes.push(text);
  }
  return [...new Set(classes)];
}

function extractChunks(html) {
  const chunks = [];
  let currentHeading = '';
  const blocks = html.split(/(?=<h[1-6][^>]*>)/i);
  for (const block of blocks) {
    const headingMatch = block.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (headingMatch) currentHeading = stripTags(headingMatch[2]).trim();
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pRe.exec(block)) !== null) {
      const text = stripTags(pm[1]).trim();
      if (text && text.length > 10) {
        chunks.push({ type: 'paragraph', text, heading: currentHeading });
      }
    }
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tm;
    while ((tm = trRe.exec(block)) !== null) {
      const cells = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let dm;
      while ((dm = tdRe.exec(tm[1])) !== null) cells.push(stripTags(dm[1]).trim());
      if (cells.length >= 2 && cells[0] && cells[1]) {
        chunks.push({ type: 'class', text: `${cells[0]} — ${cells[1]}`, heading: currentHeading });
      }
    }
  }
  return chunks.slice(0, 80);
}

function pageUrl(site, route) {
  if (!route || route === '/') return `${site.replace(/\/$/, '')}/`;
  return `${site.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
}

function normalizeIcon(icon) {
  const value = String(icon || 'file-text').trim().replace(/^ph-/, '');
  return value || 'file-text';
}

function parseNavObject(src) {
  const marker = src.indexOf('export const nav');
  if (marker < 0) throw new Error('Could not find export const nav in nav.ts');
  const eq = src.indexOf('=', marker);
  const objStart = src.indexOf('{', eq);
  if (objStart < 0) throw new Error('Could not find nav object literal');
  let depth = 0;
  let end = -1;
  for (let i = objStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Unbalanced nav object literal');
  return new Function(`return (${src.slice(objStart, end)});`)();
}

async function loadNav(config) {
  const siblingPath = config.navPath
    ? path.resolve(config.navPath, config.navPath.endsWith('nav.ts') ? '' : 'src/nav.ts')
    : path.resolve(PROJECT_ROOT, '../vd3-docs/src/nav.ts');

  if (fs.existsSync(siblingPath)) {
    console.log(`📖 Reading nav from ${siblingPath}`);
    return parseNavObject(fs.readFileSync(siblingPath, 'utf-8'));
  }

  console.log(`📖 Fetching nav from ${config.navUrl}`);
  const res = await fetch(config.navUrl, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch nav.ts (${res.status})`);
  return parseNavObject(await res.text());
}

function flattenNavEntries(nav) {
  const entries = [];
  for (const page of nav.pages || []) {
    entries.push({
      id: page.id,
      title: page.title,
      route: page.route || '/',
      icon: normalizeIcon(page.icon),
      keywords: page.keywords || [],
      category: 'Page',
      tab: 'pages',
      tabTitle: 'Pages',
    });
  }
  for (const tab of nav.tabs || []) {
    for (const category of tab.categories || []) {
      for (const section of category.sections || []) {
        entries.push({
          id: section.id,
          title: section.title,
          route: section.route,
          icon: normalizeIcon(section.icon || category.icon || tab.icon),
          keywords: section.keywords || [],
          category: category.title || category.id,
          tab: tab.id,
          tabTitle: tab.title || tab.id,
        });
      }
    }
  }
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function buildDocument(entry, html, contentSelector) {
  const region = cleanDocHtml(extractMainContent(html, contentSelector));
  const headings = extractHeadings(region);
  const paragraphs = extractParagraphs(region);
  const classes = extractClasses(region);
  const chunks = extractChunks(region);
  const classTexts = chunks.filter((c) => c.type === 'class').map((c) => c.text);
  const bodyText = [...paragraphs, ...classTexts.slice(0, 40)].join('. ').slice(0, 8000);
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tab: entry.tab,
    tabTitle: entry.tabTitle,
    route: entry.route,
    icon: entry.icon,
    keywords: entry.keywords,
    headings,
    bodyText,
    classes,
    chunks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const config = loadConfig(args);
  const preset = EMBEDDING_PRESETS[config.preset];
  if (!preset) {
    console.error(`Unknown preset "${config.preset}". Use embeddinggemma, minilm, or e5.`);
    process.exit(1);
  }

  console.log('🔱 vdl-hybrid-index starting...\n');
  console.log(`🌐 Site: ${config.site}`);
  console.log(`🧠 Preset: ${config.preset} (${preset.modelName})`);
  console.log(`📁 Output: ${config.outDir}\n`);

  if (!fs.existsSync(config.outDir)) fs.mkdirSync(config.outDir, { recursive: true });

  const nav = await loadNav(config);
  const entries = flattenNavEntries(nav);
  console.log(`Found ${entries.length} nav entries\n`);

  const documents = [];
  const failed = [];

  await mapPool(entries, config.fetchConcurrency, async (entry) => {
    const url = pageUrl(config.site, entry.route);
    try {
      const html = await fetchHtml(url);
      const doc = buildDocument(entry, html, config.contentSelector);
      if (!doc.bodyText && !doc.headings.length && !doc.chunks.length) {
        doc.bodyText = `${doc.title}. ${doc.category}. ${(doc.keywords || []).join('. ')}`;
      }
      documents.push(doc);
      process.stdout.write(`  ✓ ${entry.id}\n`);
    } catch (err) {
      failed.push({ id: entry.id, url, error: err.message });
      process.stdout.write(`  ✗ ${entry.id} (${err.message})\n`);
    }
  });

  documents.sort((a, b) => {
    const tabCmp = String(a.tab).localeCompare(String(b.tab));
    if (tabCmp) return tabCmp;
    return String(a.title).localeCompare(String(b.title));
  });

  if (failed.length) {
    console.warn(`\n⚠️  Failed ${failed.length} pages:`, failed.slice(0, 8));
  }

  console.log(`\n✅ Built ${documents.length} documents`);

  const indexPath = path.join(config.outDir, 'search-index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ documents }, null, 2));
  console.log(`📝 search-index.json (${(fs.statSync(indexPath).size / 1024).toFixed(1)} KB)`);

  console.log('\n🧠 Loading embedding model...');
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', preset.modelName, {
    dtype: preset.dtype,
  });

  console.log('🧠 Generating embeddings...');
  const vectors = [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const text = buildEmbedInput(doc, config.preset);
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    vectors.push({ id: doc.id, embedding: Array.from(output.data) });
    if ((i + 1) % 10 === 0 || i === documents.length - 1) {
      console.log(`  ${i + 1}/${documents.length} done`);
    }
  }

  const vectorsPath = path.join(config.outDir, 'vectors.json');
  fs.writeFileSync(
    vectorsPath,
    JSON.stringify(
      {
        model: preset.modelName,
        preset: config.preset,
        source: config.site,
        generatedAt: new Date().toISOString(),
        dimensions: vectors[0]?.embedding.length || preset.dimensions,
        documents: vectors,
      },
      null,
      2,
    ),
  );
  console.log(`🧬 vectors.json (${(fs.statSync(vectorsPath).size / 1024).toFixed(1)} KB)`);

  const indexIds = new Set(documents.map((d) => d.id));
  const vectorIds = new Set(vectors.map((v) => v.id));
  const missingFromVectors = [...indexIds].filter((id) => !vectorIds.has(id));
  const orphanVectors = [...vectorIds].filter((id) => !indexIds.has(id));
  if (missingFromVectors.length || orphanVectors.length) {
    console.error('❌ Index/vector id mismatch', { missingFromVectors, orphanVectors });
    process.exit(1);
  }

  console.log('\n✨ Indexing complete!');
}

main().catch((err) => {
  console.error('💥 Indexer failed:', err);
  process.exit(1);
});
