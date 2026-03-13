const fetch = require('node-fetch');

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

async function fetchTranscripts() {
  const query = `
    query {
      transcripts {
        id
        title
        date
        duration
        attendees {
          displayName
          email
        }
        summary {
          overview
        }
        sentences {
          index
          speaker_name
          text
          start_time
          end_time
        }
      }
    }
  `;

  const response = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.FIREFLIES_API_KEY}`
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Fireflies API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Fireflies GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.transcripts;
}

async function fetchTranscript(id) {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        attendees {
          displayName
          email
        }
        summary {
          overview
        }
        sentences {
          index
          speaker_name
          text
          start_time
          end_time
        }
      }
    }
  `;

  const response = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.FIREFLIES_API_KEY}`
    },
    body: JSON.stringify({ query, variables: { id } })
  });

  if (!response.ok) {
    throw new Error(`Fireflies API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Fireflies GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.transcript;
}

function formatTranscript(sentences) {
  if (!sentences || sentences.length === 0) return '';
  return sentences
    .sort((a, b) => a.index - b.index)
    .map(s => `${s.speaker_name}: ${s.text}`)
    .join('\n');
}

module.exports = { fetchTranscripts, fetchTranscript, formatTranscript };
