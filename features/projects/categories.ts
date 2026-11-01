export const PROJECT_CATEGORIES = [
  'Design & Creative',
  'Web Development',
  'Mobile Apps',
  'Writing & Translation',
  'Marketing & Social Media',
  'Video & Animation',
  'Data & Analytics',
  'Accounting & Legal',
  'Home & Repairs',
  'Photography',
  'Teaching & Tutoring',
  'Other',
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
