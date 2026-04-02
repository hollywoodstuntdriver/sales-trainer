const OpenAI = require('openai');

let client;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

let methodology = '';

function setMethodology(text) {
  methodology = text;
}

function getMethodology() {
  return methodology;
}

async function generateScorecard(transcript) {
  const prompt = `Here is the BowTiedSalesGuy sales methodology for reference:

${methodology}

---

Here is the sales call transcript:

${transcript}

---

Grade this call and tell me what Jason Bondi (the sales person) should've done better using the BowTiedSalesGuy methodology. Be very specific. Include:
1. An overall score (e.g. 73/100)
2. What was done well
3. Specific moments where the methodology was not followed and what should have been said/done instead
4. Key takeaways for improvement`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.choices[0].message.content;
}

async function generateIdealScript(transcript) {
  const prompt = `Here is the BowTiedSalesGuy sales methodology for reference:

${methodology}

---

Here is the sales call transcript:

${transcript}

---

Using the above transcript as a base, rewrite it as if Jason Bondi had handled the call perfectly according to the BowTiedSalesGuy methodology.

Format it exactly like the original transcript (Speaker Name: dialogue), but replace Jason's lines with what he should have said. Keep the prospect's lines as-is. This should feel like a real call script that could be used for training.`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.choices[0].message.content;
}

async function reformatTranscript(rawText) {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8096,
    messages: [{
      role: 'user',
      content: `Reformat this raw sales call transcript into the following exact format, one entry per line:

Speaker Name: M:SS  dialogue text here

Rules:
- Convert any timestamp format (00:26, 0:26, 26s, 1:05:30, etc.) to M:SS (e.g. 0:26, 1:05, 65:10)
- If no timestamps exist, start at 0:00 and increment naturally based on conversation flow
- Preserve speaker names exactly as they appear in the source
- One line per speaker turn — do not split or merge turns
- Return ONLY the formatted lines, no headers, labels, or commentary

Raw transcript:
${rawText}`
    }]
  });
  return response.choices[0].message.content.trim();
}

async function reformatIdealScript(rawScript) {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8096,
    messages: [{
      role: 'user',
      content: `Reformat the following script into transcript rows. Keep the speaker's exact words unchanged. Output only rows in this format:

Speaker Name: M:SS  dialogue text here

Rules:
- Assign timestamps sequentially starting from 0:00, incrementing naturally based on line length
- Preserve all speaker names exactly as written
- Do not add, remove, or rewrite any words
- One line per speaker turn
- Return ONLY the formatted rows, nothing else

Script:
${rawScript}`
    }]
  });
  return response.choices[0].message.content.trim();
}

module.exports = { generateScorecard, generateIdealScript, reformatTranscript, reformatIdealScript, setMethodology, getMethodology };
