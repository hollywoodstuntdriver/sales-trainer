const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { fetchTranscripts, formatTranscript } = require('../services/fireflies');

// GET /api/calls - list all cached calls
router.get('/', (req, res) => {
  const db = getDb();
  const calls = db.all(
    'SELECT id, title, date, duration, attendees FROM calls ORDER BY date DESC'
  );
  const parsed = calls.map(c => ({ ...c, attendees: JSON.parse(c.attendees || '[]') }));
  res.json(parsed);
});

// POST /api/calls/sync - pull latest from Fireflies and store
router.post('/sync', async (req, res) => {
  try {
    const transcripts = await fetchTranscripts();
    const db = getDb();

    db.run('BEGIN');
    try {
      for (const t of transcripts) {
        db.run(
          `INSERT INTO calls (id, title, date, duration, attendees, transcript, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             date = excluded.date,
             duration = excluded.duration,
             attendees = excluded.attendees,
             transcript = excluded.transcript,
             summary = excluded.summary,
             synced_at = strftime('%s', 'now')`,
          [
            t.id,
            t.title || 'Untitled Call',
            t.date,
            t.duration || 0,
            JSON.stringify(t.attendees || []),
            formatTranscript(t.sentences),
            t.summary?.overview || ''
          ]
        );
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }

    res.json({ synced: transcripts.length });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/:id - get a single call with transcript
router.get('/:id', (req, res) => {
  const db = getDb();
  const call = db.get('SELECT * FROM calls WHERE id = ?', [req.params.id]);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ ...call, attendees: JSON.parse(call.attendees || '[]') });
});

// PATCH /api/calls/:id/title
router.patch('/:id/title', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const db = getDb();
  db.run('UPDATE calls SET title = ? WHERE id = ?', [title, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
