export interface FAQ {
  faq_id: number;
  question: string;
  answer: string;
  category?: string | null;
  status?: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FAQCreate {
  question: string;
  answer: string;
  category?: string | null;
  status?: string;
  display_order?: number;
}

export interface FAQUpdate {
  question?: string;
  answer?: string;
  category?: string | null;
  status?: string;
  display_order?: number;
}

