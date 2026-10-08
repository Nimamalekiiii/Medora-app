const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { analyzeStudyData } = require('./ai/study-analysis');
const { analyzeProgress } = require('./ai/progress-analysis');
const { analyzeTopic } = require('./ai/topic-analysis');
const { generateQuiz, generateFlashcards, generateActiveRecall } = require('./ai/study-material');

const app = express();
const requests = new Map();
const dailyRequests = new Map();
const WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_REQUESTS_PER_DAY = Number(process.env.AI_MAX_REQUESTS_PER_DAY || 30);

app.use(cors());
app.use(express.json({ limit: '64kb' }));

async function authenticateAIUser(req, res, next) {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !publishableKey) {
    return res.status(503).json({ success: false, message: 'AI sign-in verification is not configured on the server.' });
  }

  const authorization = req.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({ success: false, message: 'Sign in to MedExam before using AI study tools.' });
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: authorization },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ success: false, message: 'Your sign-in expired. Please sign in again.' });
    }
    if (!response.ok) {
      return res.status(503).json({ success: false, message: 'MedExam could not verify your sign-in. Please try again.' });
    }
    const user = await response.json();
    if (typeof user?.id !== 'string' || !user.id) {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Please sign in again.' });
    }
    req.userId = user.id;
    return next();
  } catch {
    return res.status(503).json({ success: false, message: 'MedExam could not verify your sign-in. Check your connection and try again.' });
  }
}

app.use('/ai', (req, res, next) => authenticateAIUser(req, res, () => {
  const now = Date.now();
  const userKey = req.userId;
  const previous = requests.get(userKey);
  const current = !previous || now - previous.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : previous;

  current.count += 1;
  requests.set(userKey, current);

  const dailyPrevious = dailyRequests.get(userKey);
  const dailyCurrent = !dailyPrevious || now - dailyPrevious.startedAt >= DAY_MS
    ? { startedAt: now, count: 0 }
    : dailyPrevious;
  dailyCurrent.count += 1;
  dailyRequests.set(userKey, dailyCurrent);

  if (requests.size > 10_000 || dailyRequests.size > 10_000) {
    for (const [key, entry] of requests) if (now - entry.startedAt >= WINDOW_MS) requests.delete(key);
    for (const [key, entry] of dailyRequests) if (now - entry.startedAt >= DAY_MS) dailyRequests.delete(key);
  }

  const dailyLimit = Number.isInteger(MAX_REQUESTS_PER_DAY) && MAX_REQUESTS_PER_DAY > 0 ? MAX_REQUESTS_PER_DAY : 30;
  if (dailyCurrent.count > dailyLimit) {
    return res.status(429).json({ success: false, message: 'The daily AI request limit has been reached. Please try again tomorrow.' });
  }
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ success: false, message: 'Too many AI requests. Please wait a minute and try again.' });
  }

  return next();
}));

app.get('/', (req, res) => {
  res.json({ message: 'MedExam AI server is running.' });
});

app.get('/health', (req, res) => {
  res.json({ success: true, configured: Boolean(process.env.OPENAI_API_KEY && process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) });
});

function sendAIError(res, error, label) {
  if (error && error.code === 'AI_KEY_MISSING') {
    return res.status(503).json({ success: false, message: 'AI is not configured on the server yet.' });
  }

  if (/^Enter |^Choose |^Study notes|^Study data |^Study progress /.test(error?.message || '')) {
    return res.status(400).json({ success: false, message: error.message });
  }

  console.error(`${label}:`, error?.message || error);
  return res.status(502).json({ success: false, message: 'AI could not create study material right now. Please try again.' });
}

app.post('/ai/analyze-study', async (req, res) => {
  try {
    const analysis = await analyzeStudyData(req.body);
    return res.json({ success: true, analysis });
  } catch (error) {
    return sendAIError(res, error, 'Study analysis error');
  }
});

app.post('/ai/analyze-progress', async (req, res) => {
  try {
    const insight = await analyzeProgress(req.body);
    return res.json({ success: true, insight });
  } catch (error) {
    return sendAIError(res, error, 'Progress analysis error');
  }
});

app.post('/ai/analyze-topic', async (req, res) => {
  try {
    const insight = await analyzeTopic(req.body);
    return res.json({ success: true, insight });
  } catch (error) {
    return sendAIError(res, error, 'Topic analysis error');
  }
});

app.post('/ai/generate-quiz', async (req, res) => {
  try {
    const result = await generateQuiz(req.body);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendAIError(res, error, 'Quiz generation error');
  }
});

app.post('/ai/generate-flashcards', async (req, res) => {
  try {
    const result = await generateFlashcards(req.body);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendAIError(res, error, 'Flashcard generation error');
  }
});

app.post('/ai/generate-active-recall', async (req, res) => {
  try {
    const result = await generateActiveRecall(req.body);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendAIError(res, error, 'Active Recall generation error');
  }
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large' || error instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: 'The request could not be read.' });
  }
  return next(error);
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MedExam AI server listening on port ${PORT}`);
});
