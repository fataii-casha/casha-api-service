export const SECURITY_QUESTIONS = [
  { id: 'first_pet', question: 'What was the name of your first pet?' },
  { id: 'mother_maiden_name', question: "What is your mother's maiden name?" },
  { id: 'birth_city', question: 'In what city were you born?' },
  { id: 'first_school', question: 'What was the name of your first school?' },
  { id: 'favorite_teacher', question: 'What was the name of your favorite teacher?' },
  { id: 'childhood_nickname', question: 'What was your childhood nickname?' },
] as const;

export type SecurityQuestionId = (typeof SECURITY_QUESTIONS)[number]['id'];

export const SECURITY_QUESTION_IDS = SECURITY_QUESTIONS.map((q) => q.id) as [
  SecurityQuestionId,
  ...SecurityQuestionId[],
];

export function getSecurityQuestionText(id: SecurityQuestionId): string {
  return SECURITY_QUESTIONS.find((q) => q.id === id)!.question;
}
