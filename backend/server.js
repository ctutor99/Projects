const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/Music', express.static('Music'));

const ZONES_PATH = path.join(__dirname, 'zones.json');

app.get('/api/zones', (req, res) => {
  try {
    const zones = JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8'));
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: 'Could not read zones' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));