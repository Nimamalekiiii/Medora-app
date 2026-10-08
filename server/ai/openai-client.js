const OpenAI = require('openai');

let client;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const error = new Error('OpenAI is not configured on the server.');
    error.code = 'AI_KEY_MISSING';
    throw error;
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
      timeout: 45_000,
      maxRetries: 2,
    });
  }

  return client;
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-6-astra';
}

module.exports = { getOpenAIClient, getModel };
