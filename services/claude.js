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

module.exports = { generateScorecard, generateIdealScript, setMethodology, getMethodology };
