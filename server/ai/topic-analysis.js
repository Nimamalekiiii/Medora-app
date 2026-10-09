const { getOpenAIClient, getModel } = require('./openai-client');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'nextStep'],
  properties: {
    overview: { type: 'string' },
    nextStep: { type: 'string' },
  },
};

const isCount = (value, max = 100_000_000) => Number.isInteger(value) && value >= 0 && value <= max;
const isText = (value, max = 180) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function validateTopicProgress(input) {
  const topic = input?.topic;
  const metrics = input?.metrics;
  if (!input || !['en', 'no'].includes(input.language) || !topic || !isText(topic.id, 100) ||
    !isText(topic.name, 140) || !isText(topic.subjectName, 100) || !metrics ||
    !isCount(metrics.practiceProgress, 100) || !(metrics.quizAccuracy === null || isCount(metrics.quizAccuracy, 100)) ||
    !isCount(metrics.quizQuestions) || !isCount(metrics.quizCorrect) || metrics.quizCorrect > metrics.quizQuestions ||
    !isCount(metrics.activeRecallQuestions) || !isCount(metrics.activeRecallAgain) || !isCount(metrics.activeRecallHard) ||
    !isCount(metrics.flashcardsTotal) || !isCount(metrics.flashcardsReviewed) || !isCount(metrics.flashcardsDue) ||
    !isCount(metrics.studySessions) || !isCount(metrics.studyMinutes) ||
    !(metrics.lastStudiedAt === null || isText(metrics.lastStudiedAt, 40)) ||
    !(metrics.daysUntilExam === null || isCount(metrics.daysUntilExam, 36_500)) ||
    !Array.isArray(metrics.troubledQuestions) || metrics.troubledQuestions.length > 5 ||
    metrics.troubledQuestions.some((question) => !isText(question, 300)) ||
    !Array.isArray(input.preferredMethods) || input.preferredMethods.length > 4 ||
    input.preferredMethods.some((method) => !['active_recall', 'quiz', 'flashcards', 'review'].includes(method))) {
    throw new Error('Study progress is incomplete or invalid.');
  }
  return { language: input.language, topic: { ...topic }, metrics: { ...metrics, troubledQuestions: [...metrics.troubledQuestions] }, preferredMethods: [...input.preferredMethods] };
}

async function analyzeTopic(input) {
  const progress = validateTopicProgress(input);
  const response = await getOpenAIClient().responses.create({
    model: getModel(),
    store: false,
    max_output_tokens: 500,
    input: [
      {
        role: 'system',
        content: [
          'You are Medora, a concise study coach for a medical student.',
          'All numeric metrics were computed from the app’s saved records. Never alter them, infer mastery, or claim improvement without a time series.',
          'Only identify a specific concept as difficult if it appears in troubledQuestions. If there is too little data, say so plainly and recommend a small next step.',
          'Choose an actionable next step that follows preferredMethods when possible. Do not invent facts about the course, student, or exam.',
          'Write in Norwegian Bokmål when language is no, otherwise English. Do not use emoji or markdown.',
          'Keep both overview and nextStep short, supportive, and grounded only in the supplied record.',
        ].join(' '),
      },
      { role: 'user', content: JSON.stringify(progress) },
    ],
    text: { format: { type: 'json_schema', name: 'medexam_topic_analysis', strict: true, schema: SCHEMA } },
  });
  if (typeof response.output_text !== 'string' || !response.output_text.trim()) throw new Error('The AI did not return a topic analysis.');
  const result = JSON.parse(response.output_text);
  if (!result || typeof result.overview !== 'string' || !result.overview.trim() || result.overview.length > 500 ||
    typeof result.nextStep !== 'string' || !result.nextStep.trim() || result.nextStep.length > 500) {
    throw new Error('The AI topic analysis could not be read.');
  }
  return { overview: result.overview.trim(), nextStep: result.nextStep.trim() };
}

module.exports = { analyzeTopic };
