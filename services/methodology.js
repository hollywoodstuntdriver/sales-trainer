const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const METHODOLOGY_DIR = path.join(__dirname, '..', 'methodology');
const CACHE_FILE = path.join(METHODOLOGY_DIR, '.processed_cache.json');

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function extractImageText(filePath) {
  const imageData = fs.readFileSync(filePath);
  const base64 = imageData.toString('base64');
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mimeType = mimeMap[ext] || `image/${ext}`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` }
        },
        {
          type: 'text',
          text: 'This is a page from a sales methodology guide. Extract ALL text and content from this image exactly as written. Preserve structure, headings, bullet points, and formatting. Output only the extracted content, nothing else.'
        }
      ]
    }]
  });

  return response.choices[0].message.content;
}

async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function loadMethodology() {
  if (!fs.existsSync(METHODOLOGY_DIR)) {
    fs.mkdirSync(METHODOLOGY_DIR, { recursive: true });
    return '';
  }

  const files = fs.readdirSync(METHODOLOGY_DIR)
    .filter(f => /\.(pdf|jpe?g|png|webp)$/i.test(f))
    .sort();

  const skipped = fs.readdirSync(METHODOLOGY_DIR)
    .filter(f => /\.heic$/i.test(f));
  if (skipped.length > 0) {
    console.log(`[methodology] Skipping unsupported HEIC files: ${skipped.join(', ')}`);
  }

  if (files.length === 0) return '';

  // Load cache
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
  }

  const results = [];
  let cacheUpdated = false;

  for (const file of files) {
    const filePath = path.join(METHODOLOGY_DIR, file);
    const stat = fs.statSync(filePath);
    const key = `${file}:${stat.mtimeMs}`;

    if (cache[key]) {
      console.log(`[methodology] Using cached: ${file}`);
      results.push({ file, content: cache[key] });
      continue;
    }

    console.log(`[methodology] Processing: ${file}`);
    const ext = path.extname(file).toLowerCase();
    let content = '';

    try {
      if (ext === '.pdf') {
        content = await extractPdfText(filePath);
      } else {
        content = await extractImageText(filePath);
      }
    } catch (err) {
      console.error(`[methodology] Failed to process ${file}:`, err.message);
      content = `[Could not extract content from ${file}]`;
    }

    cache[key] = content;
    cacheUpdated = true;
    results.push({ file, content });
  }

  if (cacheUpdated) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log('[methodology] Cache updated.');
  }

  return results.map(r => `=== ${r.file} ===\n${r.content}`).join('\n\n');
}

module.exports = { loadMethodology };
