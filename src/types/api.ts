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
  expected_values?: {
    accepted_values?: string[];  // Suggested values for dropdown/chips
    allow_custom?: boolean;      // Allow free text input (for Q8)
    type?: 'compound';           // For compound questions like Q7
    fields?: string[];           // Field names for compound ["months", "projects"]
    display_format?: string;     // Format template for compound
  };
  response: Response | null;
}

export interface Response {
  question_id: string;
  answer_text: string;
  selected_option_id: string | null;
}

export interface Recommendation {
  rank: number;
  course_id: string;
  course_title: string;
  course_url: string;
  relevance_score: number;
  match_reason: string;
  metadata: {
    subject: string;
    level: string;
    num_subscribers: string;
    num_reviews: string;
    is_paid: string;
    price: string;
  };
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
