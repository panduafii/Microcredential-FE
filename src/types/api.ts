export interface Assessment {
  assessment_id: string;
  owner_id: string;
  role_slug: string;
  status: 'draft' | 'in_progress' | 'submitted' | 'completed' | 'failed';
  expires_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface QuestionOption {
  id: string;     // "A", "B", "C", "D", "E"
  text: string;   // Option text
}

export interface ProjectCountRange {
  min: number;
  max: number;
  score: number;
}

export interface QuestionExpectedValues {
  accepted_values?: string[];  // Suggested values for dropdown/chips
  allow_custom?: boolean;      // Allow free text input (for Q8)
  type?: 'compound' | 'project_checklist'; // Structured profile question types
  fields?: string[];           // Field names for compound ["months", "projects"]
  display_format?: string;     // Format template for compound
  project_count?: {
    ranges?: ProjectCountRange[];
  };
  checklist_scoring?: Record<string, number>;
}

export interface Question {
  id: string;
  sequence: number;
  question_type: 'theoretical' | 'essay' | 'profile';
  prompt: string;
  options?: QuestionOption[];  // For theoretical & profile
  metadata: {
    dimension: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
  expected_values?: QuestionExpectedValues;
  response: Response | null;
}

export interface Response {
  question_id: string;
  answer_text: string;
  selected_option_id: string | null;
}

export type LearningPathKey = "mandatory_foundation" | "target_path";

export interface RecommendationMetadata {
  subject?: string;
  level?: string;
  num_subscribers?: string;
  num_reviews?: string;
  is_paid?: string;
  price?: string;
  learning_path?: LearningPathKey;
  learning_path_label?: string;
}

export interface Recommendation {
  rank: number;
  course_id: string;
  course_title: string;
  course_url?: string | null;
  relevance_score: number;
  match_reason?: string | null;
  metadata?: RecommendationMetadata | null;
}

export interface LearningPathsTrace {
  mode?: "single-path" | "two-path";
  mandatory_foundation_count?: number;
  target_path_count?: number;
  mandatory_foundation_query?: string;
  target_path_query?: string;
  note?: string;
}

export interface ReadinessTrace {
  readiness_tier?: string;
  force_foundation?: boolean;
  reason?: string;
  learning_paths?: LearningPathsTrace | null;
}

export interface RagTraces {
  query?: string;
  method?: string;
  top_k?: number;
  degraded?: boolean;
  match_count?: number;
  readiness?: ReadinessTrace | null;
}

export interface ScoreBreakdown {
  theoretical: {
    score: number;
    max: number;
    percentage: number;
  };
  profile: {
    score: number;
    max: number;
    percentage: number;
  };
  essay: {
    score: number;
    max: number;
    percentage: number;
  };
  overall: {
    score: number;
    percentage: number;
  };
}
