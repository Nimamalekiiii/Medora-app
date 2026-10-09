import type { ProgressDashboard } from '@/services/progress-dashboard';
import type { ProgressMetrics } from '@/services/progress-metrics';

export type ProgressTabKey = 'overview' | 'topics' | 'exams' | 'insights';

export type TopicRef = { id: number | string; name: string; subjectId: string };

export type ProgressTabProps = {
  dashboard: ProgressDashboard;
  metrics: ProgressMetrics;
  language: 'en' | 'no';
  openTopic: (topic: TopicRef) => void;
  goToTab: (tab: ProgressTabKey) => void;
};
