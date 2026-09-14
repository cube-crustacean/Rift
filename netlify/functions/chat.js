// netlify/functions/chat.js
//
// Serverless proxy that forwards chat messages to the Groq API.
// Keeps GROQ_API_KEY on the server side only — it never reaches the browser.

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request format.' })
    };
  }

  const { messages } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'A non-empty "messages" array is required.' })
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY environment variable is not set.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server is not configured correctly. Please try again later.' })
    };
  }

  // Sanitize messages down to the shape the API expects
  const sanitizedMessages = messages
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map(m => ({ role: m.role, content: m.content }));

  if (sanitizedMessages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'No valid messages were provided.' })
    };
  }

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: sanitizedMessages,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      let details = '';
      try {
        const errJson = await response.json();
        details = errJson && errJson.error && errJson.error.message ? errJson.error.message : '';
      } catch (e) {
        // ignore parse failure
      }

      if (response.status === 429) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            error: "Rift is getting a lot of requests right now. Please wait a moment and try again."
          })
        };
      }

      if (response.status === 401 || response.status === 403) {
        console.error('Groq auth error:', details);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Server is not configured correctly. Please try again later.' })
        };
      }

      console.error('Groq API error:', response.status, details);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'The AI service ran into a problem. Please try again in a moment.' })
      };
    }

    const data = await response.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';

    if (!reply) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'The AI service returned an empty response. Please try again.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    console.error('Unexpected error calling Groq API:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong while talking to the AI service. Please try again.' })
    };
  }
};
