export type Subject = {
  id: string | number;
  name: string;
  icon?: string;
  emoji?: string;
};

export type Topic = {
  id: number;
  name: string;
};

export type TopicsBySubject = {
  [subjectId: string]: Topic[];
};

export type Exam = {
  date: string;
  type: string;
  topicIds: number[];
};

export type ExamsBySubject = {
  [subjectId: string]: Exam | null;
};

export type StudyPlanSettings = {
  /** Days use JavaScript's Date.getDay() values: Sunday = 0, Monday = 1. */
  studyDays: number[];
  dailyStudyMinutes: number;
};

export type StudyPlansBySubject = {
  [subjectId: string]: StudyPlanSettings;
};

export type StudyActivityType =
  | 'active_recall'
  | 'quiz'
  | 'review'
  | 'flashcards'
  | 'focus';

export type StudyConfidence = 'low' | 'medium' | 'high';

export type StudyActivity = {
  id: number;
  topicId: string;
  topicName: string;
  activity: StudyActivityType;
  completedAt: string;
  durationSeconds: number;
  questionCount: number;
  correctCount?: number;
  wrongCount?: number;
  score?: number;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
  confidence?: StudyConfidence;
};

export type ActiveRecallQuestion = {
  id: number;
  question: string;
  answer: string;
  createdBy?: 'manual' | 'ai';
  nextReviewAt?: string;
  lastRatedAt?: string;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
};

export type ActiveRecallQuestionsByTopic = {
  [topicId: string]: ActiveRecallQuestion[];
};

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type GeneratedQuizSet = {
  id: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  generatedAt: string;
  mode?: 'standard' | 'adaptive';
  questions: QuizQuestion[];
};

export type GeneratedQuizzesByTopic = {
  [topicId: string]: GeneratedQuizSet[];
};

export type QuizResult = {
  id: string;
  topicId: string;
  topicName: string;
  completedAt: string;
  questionCount: number;
  correctCount: number;
  wrongCount: number;
  score: number;
  durationSeconds: number;
  answeredCount?: number;
  missedQuestions?: Array<{
    question: string;
    selectedAnswer: string;
    correctAnswer: string;
    explanation?: string;
  }>;
};

export type Flashcard = {
  id: string;
  topicId: string;
  topicName: string;
  front: string;
  back: string;
  createdAt: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type FlashcardReview = {
  id: string;
  flashcardId: string;
  topicId: string;
  reviewedAt: string;
  rating: 'again' | 'hard' | 'good' | 'easy';
};

export type TopicProgress = {
  topicId: string;
  topicName: string;

  quizAccuracy: number | null;

  activeRecallCount: number;
  quizCount: number;
  reviewCount: number;
  flashcardCount: number;

  questionsAnswered: number;
  correctAnswers: number;
  wrongAnswers: number;

  studyTimeSeconds: number;

  hardCount: number;
  againCount: number;
  goodCount: number;
  easyCount: number;

  lastStudiedAt?: string;
};

export type StudyRecommendation = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;

  priority: 'low' | 'medium' | 'high';

  reason: string;

  recommendedActivities: StudyActivityType[];

  estimatedMinutes: number;
};

export type PreparationAnalysis = {
  overallScore: number;

  topicsCovered: number;
  totalTopics: number;

  quizAccuracy: number | null;

  activeRecallCoverage: number;
  reviewCoverage: number;
  flashcardCoverage: number;

  studyDays: number;

  weakTopics: string[];

  recommendations: StudyRecommendation[];
};
