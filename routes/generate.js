const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { generateScorecard, generateIdealScript, setMethodology, getMethodology } = require('../services/claude');

// GET /api/generate/methodology
router.get('/methodology', (req, res) => {
  res.json({ text: getMethodology() });
});

// POST /api/generate/methodology
router.post('/methodology', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  setMethodology(text);
  res.json({ ok: true });
});

// GET /api/generate/:callId/scorecard
router.get('/:callId/scorecard', async (req, res) => {
  const db = getDb();
  const { callId } = req.params;

  const cached = db.get('SELECT scorecard FROM generated_content WHERE call_id = ?', [callId]);
  if (cached?.scorecard) {
    return res.json({ content: cached.scorecard, cached: true });
  }

  const call = db.get('SELECT transcript FROM calls WHERE id = ?', [callId]);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!call.transcript) return res.status(400).json({ error: 'No transcript available' });

  try {
    const scorecard = await generateScorecard(call.transcript);

    db.run(
      `INSERT INTO generated_content (call_id, scorecard, scorecard_generated_at)
       VALUES (?, ?, strftime('%s', 'now'))
       ON CONFLICT(call_id) DO UPDATE SET
         scorecard = excluded.scorecard,
         scorecard_generated_at = excluded.scorecard_generated_at`,
      [callId, scorecard]
    );

    res.json({ content: scorecard, cached: false });
  } catch (err) {
    console.error('Scorecard generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/generate/:callId/ideal-script
router.get('/:callId/ideal-script', async (req, res) => {
  const db = getDb();
  const { callId } = req.params;

  const cached = db.get('SELECT ideal_script FROM generated_content WHERE call_id = ?', [callId]);
  if (cached?.ideal_script) {
    return res.json({ content: cached.ideal_script, cached: true });
  }

  const call = db.get('SELECT transcript FROM calls WHERE id = ?', [callId]);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!call.transcript) return res.status(400).json({ error: 'No transcript available' });

  try {
    const idealScript = await generateIdealScript(call.transcript);

    db.run(
      `INSERT INTO generated_content (call_id, ideal_script, ideal_script_generated_at)
       VALUES (?, ?, strftime('%s', 'now'))
       ON CONFLICT(call_id) DO UPDATE SET
         ideal_script = excluded.ideal_script,
         ideal_script_generated_at = excluded.ideal_script_generated_at`,
      [callId, idealScript]
    );

    res.json({ content: idealScript, cached: false });
  } catch (err) {
    console.error('Ideal script generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
