import type { StaffSecurityQuestion } from '@/types';

export const SECURITY_QUESTIONS: StaffSecurityQuestion[] = ['Lieblingstier', 'Lieblingsessen', 'Lieblingsfarbe'];

const questionLabels: Record<StaffSecurityQuestion, string> = {
  Lieblingstier: 'Was ist dein Lieblingstier?',
  Lieblingsessen: 'Was ist dein Lieblingsessen?',
  Lieblingsfarbe: 'Was ist deine Lieblingsfarbe?',
};

export function formatSecurityQuestion(question: StaffSecurityQuestion | null | ''): string {
  return question ? questionLabels[question] : '';
}
