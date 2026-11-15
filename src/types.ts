export type ExamType = 'CAT' | 'GMAT';
export type DifficultyLevel = 'Standard' | 'Challenging' | 'Brutal';
export type QuestionType =
  | 'Main Idea'
  | 'Inference'
  | 'Tone & Attitude'
  | 'Paragraph Function'
  | 'Strengthen / Weaken'
  | 'Detail & Logic'
  | 'Vocabulary in Context';

export type FlawTag =
  | 'extreme'
  | 'opposite'
  | 'scope'
  | 'distortion'
  | 'causal'
  | 'comparison'
  | 'irrelevant';

export interface RCOption {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
  explanation: string;
  flawTag?: FlawTag | string;
  tempting?: string;
}

export interface RCQuestion {
  id: string;
  type: QuestionType;
  subtype?: string;
  subtypeId?: string;
  stem: string;
  correctLetter: 'A' | 'B' | 'C' | 'D' | 'E';
  options: RCOption[];
  paragraphsNeeded?: string[];
}

export const QUESTION_TYPES: readonly QuestionType[] = [
  'Main Idea',
  'Inference',
  'Paragraph Function',
  'Tone & Attitude',
  'Strengthen / Weaken',
  'Detail & Logic',
  'Vocabulary in Context'
] as const;

export function mapSubtypeToType(subtype?: string): QuestionType {
  const s = (subtype || '').toLowerCase().trim();
  if (/title|central\s*idea|primary\s*purpose/.test(s)) return 'Main Idea';
  if (/can(not)?\s*be\s*inferred|except|author\s*would|agree|disagree|application/.test(s)) return 'Inference';
  if (/according\s*to\s*the\s*passage/.test(s)) return 'Detail & Logic';
  if (/role\s*of|paragraph|example/.test(s)) return 'Paragraph Function';
  if (/attitude|stance|tone/.test(s)) return 'Tone & Attitude';
  if (/assumption|strengthen|weaken/.test(s)) return 'Strengthen / Weaken';
  if (/meaning|phrase|word\s*in\s*context|vocabulary/.test(s)) return 'Vocabulary in Context';
  return 'Inference';
}

export interface RCTest {
  id: string | number;
  slug?: string;
  title: string;
  topic: string;
  source_label: string;
  category: 'library' | 'pyq' | 'live' | 'custom';
  exam_type: ExamType;
  difficulty: DifficultyLevel;
  pyq_year?: number | null;
  pyq_slot?: number | null;
  pyq_passage_num?: number | null;
  word_count: number;
  target_seconds: number;
  passage_paragraphs: string[];
  questions: RCQuestion[];
  is_live_featured?: boolean;
  live_date?: string | null;
  created_by?: string | null;
  generation_source?: 'ai' | 'fallback' | 'algorithm' | null;
  generation_reason?: string | null;
  generation_diagnostics?: any | null;
  verification_info?: {
    reviewer: 'groq' | 'gemini' | 'none';
    questionsChecked: number;
    questionsKept: number;
    groqUnavailable?: boolean;
    groqModelUsed?: string;
    groqModelsTried?: string[];
    groqFailureMessage?: string;
    groqFailureClass?: string;
  } | null;
  created_at?: string;
}

export interface TypeBreakdownItem {
  type: string;
  correct: number;
  total: number;
}

export interface RCAttempt {
  id: string | number;
  test_id: string | number;
  user_id?: string;
  user_name?: string;
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
  id: string | number;
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
