import { SecurityQuestionId } from '../security-questions';

export interface SetPersonalDetailsInput {
  userId: string;
  firstName: string;
  lastName: string;
  otherName?: string;
  dob: string;
}

export interface SetPinInput {
  userId: string;
  pin: string;
  securityQuestionId: SecurityQuestionId;
  securityAnswer: string;
}
