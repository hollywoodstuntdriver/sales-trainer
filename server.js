require('dotenv').config();
const express = require('express');
const path = require('path');

const callsRouter = require('./routes/calls');
const generateRouter = require('./routes/generate');
const importRouter = require('./routes/import');
const { loadMethodology } = require('./services/methodology');
const { setMethodology } = require('./services/claude');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/calls', callsRouter);
app.use('/api/generate', generateRouter);
app.use('/api/import', importRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  console.log('[startup] Loading BowTiedSalesGuy methodology...');
  const methodology = await loadMethodology();
  if (methodology) {
    setMethodology(methodology);
    console.log(`[startup] Methodology loaded (${methodology.length} chars).`);
  } else {
    console.log('[startup] No methodology files found in /methodology — add files and restart.');
  }

  app.listen(PORT, () => {
    console.log(`Sales Trainer running at http://localhost:${PORT}`);
  });
}

start();
