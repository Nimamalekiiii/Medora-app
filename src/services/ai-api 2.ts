const AI_SERVER_URL = 'http://192.168.68.57:3000';

export type AIStudyAnalysis = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  recommendedActivities: (
    | 'active_recall'
    | 'quiz'
    | 'review'
    | 'flashcards'
  )[];
  estimatedMinutes: number;
};

export async function getAIStudyAnalysis(
  studyData: unknown
): Promise<AIStudyAnalysis> {
  const response = await fetch(
    `${AI_SERVER_URL}/ai/analyze-study`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studyData),
    }
  );

  if (!response.ok) {
    throw new Error(
      `AI server returned ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.success || !data.analysis) {
    throw new Error(
      data.message ||
        'AI study analysis failed.'
    );
  }

  return data.analysis;
}