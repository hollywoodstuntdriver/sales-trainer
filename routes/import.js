const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const rtfParser = require('rtf-parser');
const { getDb } = require('../db/database');

function parseRtf(content) {
  return new Promise((resolve, reject) => {
    rtfParser.string(content, (err, doc) => {
      if (err) return reject(err);
      let text = '';
      function walk(node) {
        if (node.value) text += node.value;
        if (node.content) node.content.forEach(walk);
      }
      walk(doc);
      resolve(text.trim());
    });
  });
}

function extractMeta(text, filename) {
  // Try to detect attendees from "Speaker: timestamp" patterns
  const speakerPattern = /^([^:\n]+):\s+\d{2}:\d{2}/gm;
  const speakers = new Set();
  let match;
  while ((match = speakerPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name) speakers.add(name);
  }
  const attendees = [...speakers].map(name => ({ displayName: name, email: '' }));

  // Estimate duration from last timestamp
  const timestamps = [...text.matchAll(/(\d{2}):(\d{2})/g)];
  let duration = 0;
  if (timestamps.length > 0) {
    const last = timestamps[timestamps.length - 1];
    duration = parseInt(last[1]) * 60 + parseInt(last[2]);
  }

  // Title from filename (strip extension)
  const title = path.basename(filename, path.extname(filename)).replace(/_/g, ' ');

  return { attendees, duration, title };
}

// POST /api/import/file  — body: { filePath }
router.post('/file', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });

  const absPath = filePath.replace(/\\ /g, ' ');
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: `File not found: ${absPath}` });
  }

  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    const ext = path.extname(absPath).toLowerCase();
    let text = raw;

    if (ext === '.rtf') {
      text = await parseRtf(raw);
    }

    // Strip any preamble before the first "Speaker: timestamp" line
    const firstEntry = text.search(/^[^\n:]+:\s+\d{2}:\d{2}/m);
    if (firstEntry > 0) text = text.slice(firstEntry);

    const filename = path.basename(absPath);
    const { attendees, duration, title } = extractMeta(text, filename);
    const stat = fs.statSync(absPath);
    const id = `local-${stat.mtimeMs}-${filename.replace(/\s+/g, '_')}`;

    const db = getDb();
    db.run(
      `INSERT INTO calls (id, title, date, duration, attendees, transcript, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         transcript = excluded.transcript,
         attendees = excluded.attendees,
         duration = excluded.duration`,
      [id, title, stat.mtimeMs, duration, JSON.stringify(attendees), text, '']
    );

    res.json({ ok: true, id, title, speakers: attendees.map(a => a.displayName) });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/folder  — body: { folderPath }
router.post('/folder', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });

  const absPath = folderPath.replace(/\\ /g, ' ');
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: `Folder not found: ${absPath}` });
  }

  const files = fs.readdirSync(absPath)
    .filter(f => /\.(rtf|txt|md)$/i.test(f));

  if (files.length === 0) {
    return res.status(400).json({ error: 'No .rtf, .txt, or .md files found in folder' });
  }

  const db = getDb();
  const results = [];

  for (const file of files) {
    const filePath = path.join(absPath, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(file).toLowerCase();
      let text = ext === '.rtf' ? await parseRtf(raw) : raw;
      const firstEntry = text.search(/^[^\n:]+:\s+\d{2}:\d{2}/m);
      if (firstEntry > 0) text = text.slice(firstEntry);

      const { attendees, duration, title } = extractMeta(text, file);
      const stat = fs.statSync(filePath);
      const id = `local-${stat.mtimeMs}-${file.replace(/\s+/g, '_')}`;

      db.run(
        `INSERT INTO calls (id, title, date, duration, attendees, transcript, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           transcript = excluded.transcript,
           attendees = excluded.attendees,
           duration = excluded.duration`,
        [id, title, stat.mtimeMs, duration, JSON.stringify(attendees), text, '']
      );

      results.push({ file, title, ok: true });
    } catch (err) {
      results.push({ file, ok: false, error: err.message });
    }
  }

  res.json({ imported: results.filter(r => r.ok).length, total: files.length, results });
});

module.exports = router;
