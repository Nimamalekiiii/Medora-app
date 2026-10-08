const express = require('express');
const cors = require('cors');
require('dotenv').config();

const OpenAI = require('openai');
const { analyzeStudyData } = require('./ai/study-analysis');

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get('/', (req, res) => {
  res.json({
    message: 'MedExam AI server is running 🚀',
  });
});

app.get('/health', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'OPENAI_API_KEY is missing.',
      });
    }

    res.json({
      success: true,
      message: 'AI backend is connected and ready.',
    });
  } catch (error) {
    console.error('Health check error:', error);

    res.status(500).json({
      success: false,
      message: 'Server health check failed.',
    });
  }
});

app.get('/ai-test', async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      input: 'Svar kun: MedExam AI fungerer!',
    });

    res.json({
      success: true,
      message: response.output_text,
    });
  } catch (error) {
    console.error('OpenAI error:', error);

    res.status(500).json({
      success: false,
      message: 'OpenAI request failed.',
    });
  }
});

app.post('/ai/analyze-study', async (req, res) => {
  try {
    const result = await analyzeStudyData(req.body);

    res.json({
      success: true,
      analysis: result,
    });
  } catch (error) {
    console.error('Study analysis error:', error);

    res.status(500).json({
      success: false,
      message: 'AI study analysis failed.',
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MedExam AI server running on port ${PORT}`);
});