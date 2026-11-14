export type ExamType = 'CAT' | 'GMAT';
export type DifficultyLevel = 'Standard' | 'Challenging' | 'Brutal';
export type QuestionType =
  | 'Main Idea'
  | 'Inference'
  | 'Tone & Attitude'
  | 'Paragraph Function'
  | 'Strengthen / Weaken'
  | 'Detail & Logic';

export interface RCOption {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
  explanation: string;
  flawTag?: string;
}

export interface RCQuestion {
  id: string;
  type: QuestionType;
  stem: string;
  correctLetter: 'A' | 'B' | 'C' | 'D' | 'E';
  options: RCOption[];
}

export interface RCTest {
  id: number;
  slug: string;
  title: string;
  topic: string;
  source_label: string;
  category: 'library' | 'pyq' | 'live' | 'custom';
  exam_type: ExamType;
  difficulty: DifficultyLevel;
  pyq_year?: number | null;
  pyq_slot?: number | null;
  word_count: number;
  target_seconds: number;
  passage_paragraphs: string[];
  questions: RCQuestion[];
  is_live_featured?: boolean;
  live_date?: string | null;
  created_by?: string | null;
  generation_source?: 'ai' | 'fallback' | null;
  generation_reason?: string | null;
  created_at?: string;
}

export interface TypeBreakdownItem {
  type: string;
  correct: number;
  total: number;
}

export interface RCAttempt {
  id: number;
  test_id: number;
  user_id: string;
  user_name: string;
  exam_type: ExamType;
  score: number;
  max_score: number;
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  total_questions: number;
  time_seconds: number;
  wpm_estimate: number;
  answers: Record<string, string | null>;
  type_breakdown: TypeBreakdownItem[];
  created_at: string;
  rc_tests?: Partial<RCTest>;
}

export interface PYQCatalogItem {
  id: number;
  year: number;
  slot: number;
  passage_num: number;
  title: string;
  topic: string;
  source_work: string;
  question_count: number;
  linked_test_id: number | null;
}

export interface GuideContentBlock {
  heading: string;
  body: string;
  bullets?: string[];
  callout?: string;
}

export interface SpeedQuestion {
  q: string;
  options: string[];
  correctIndex: number;
}

export interface RCGuide {
  id: number;
  slug: string;
  category: 'guide' | 'blog' | 'speed_passage';
  eyebrow: string;
  title: string;
  summary: string;
  read_minutes: number;
  content_blocks: GuideContentBlock[] | {
    wordCount: number;
    paragraphs: string[];
    questions: SpeedQuestion[];
  };
}
