export type Task = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskDraft = {
  title: string;
  description: string;
  source: 'claude' | 'local';
};

export type StatusFilter = 'all' | 'active' | 'completed';
