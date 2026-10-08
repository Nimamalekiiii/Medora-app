const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeStudyData(studyData) {
  const prompt = `
You are the AI study engine for MedExam, a medical exam study app.

Analyze the student's current study data and decide what they should focus on next.

Study data:
${JSON.stringify(studyData, null, 2)}

Return ONLY valid JSON in this exact structure:

{
  "topicId": "string",
  "topicName": "string",
  "subjectId": "string",
  "subjectName": "string",
  "priority": "low" | "medium" | "high",
  "reason": "string",
  "recommendedActivities": ["active_recall", "quiz", "review", "flashcards"],
  "estimatedMinutes": number
}

Rules:
- Choose the single most important topic to study next.
- Consider previous study activity, quiz performance, review history, flashcards and exam information.
- Prioritize weak or neglected topics.
- If a topic has never been studied, consider it high priority.
- If quiz performance is poor, prioritize improving that topic.
- If a topic has not been studied for a long time, consider review.
- Do not invent topics that are not included in the provided data.
- Keep the reason short and understandable.
`;

  const response = await openai.responses.create({
    model: 'gpt-5.6-luna',
    input: prompt,
  });

  const text = response.output_text.trim();

  return JSON.parse(text);
}

module.exports = {
  analyzeStudyData,
};