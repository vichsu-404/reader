export type BookFormat = 'epub' | 'txt';
export type UnitKind = 'paragraph' | 'heading' | 'list_item' | 'quote';
export type CaptureSource = 'selection' | 'chat' | 'manual';
export type MessageRole = 'user' | 'coach';
export type CoachMode = 'explain' | 'ask';

export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  source_path: string | null;
  normalize_version: string;
  unit_count: number;
  imported_at: string;
  updated_at: string;
}

export interface ChapterRow {
  book_id: string;
  chapter_index: number;
  title: string | null;
}

export interface UnitRow {
  unit_id: string;
  book_id: string;
  chapter_index: number;
  seq: number;
  kind: UnitKind;
  text: string;
  char_count: number;
  is_orphaned: number;
  matched_from_unit_id: string | null;
  created_at: string;
}

export interface CoachProfileRow {
  id: string;
  name: string;
  level: string;
  target_locale: string;
  tone: string | null;
  extra_instructions: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  book_id: string;
  coach_profile_id: string;
  rolling_summary: string | null;
  summary_upto_unit_id: string | null;
  summary_upto_seq: number | null;
  started_at: string;
  last_active_at: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  book_id: string;
  unit_id: string | null;
  seq: number;
  role: MessageRole;
  mode: CoachMode | null;
  content: string;
  provider_id: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface ProgressRow {
  book_id: string;
  unit_id: string;
  seq: number;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  book_id: string | null;
  unit_id: string | null;
  selected_text: string | null;
  body: string;
  source: CaptureSource;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VocabRow {
  id: string;
  term: string;
  gloss_zh: string;
  reading: string | null;
  example_en: string | null;
  note: string | null;
  book_id: string | null;
  unit_id: string | null;
  source: CaptureSource;
  source_message_id: string | null;
  ease: number;
  interval_days: number;
  due_at: string | null;
  review_count: number;
  created_at: string;
  updated_at: string;
}
