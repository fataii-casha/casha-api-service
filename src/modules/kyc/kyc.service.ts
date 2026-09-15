import { AppDataSource } from '../../config/data-source';
import { User, OnboardingStep } from '../user/user.entity';
import { ApiError } from '../../utils/api-error';
import { logger } from '../../config/logger';
import { dojahIntegration } from '@/integrations/dojah';
import { nameSimilarity } from '@/utils/levenshtein';

const userRepo = () => AppDataSource.getRepository(User);
const NAME_MATCH_THRESHOLD = 0.8;

interface VerifyBvnInput {
  userId: string;
  bvn: string;
}

export async function verifyBvn(input: VerifyBvnInput) {
  const user = await userRepo().findOne({ where: { id: input.userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.bvnVerified) {
    throw ApiError.conflict('BVN has already been verified for this account');
  }

  if (!user.firstName || !user.lastName) {
    throw ApiError.badRequest('Complete the personal details step before BVN verification');
  }

  const result = await dojahIntegration.verifyBVN(input.bvn);
  const entity = result.data?.entity;

  if (!entity) {
    throw ApiError.badRequest(
      'Could not retrieve BVN record. Please check the number and try again.',
    );
  }

  const firstNameScore = nameSimilarity(entity.first_name, user.firstName);
  const lastNameScore = nameSimilarity(entity.last_name, user.lastName);

  const firstNameMatches = firstNameScore >= NAME_MATCH_THRESHOLD;
  const lastNameMatches = lastNameScore >= NAME_MATCH_THRESHOLD;

  if (!firstNameMatches || !lastNameMatches) {
    logger.warn(
      { userId: user.id, firstNameScore, lastNameScore },
      'BVN name mismatch against onboarding profile',
    );
    throw ApiError.badRequest(
      'The name on this BVN does not closely match the details you provided. Please double-check and try again.',
    );
  }

  user.bvnVerified = true;
  user.bvnLast4 = input.bvn.slice(-4);
  user.kycTier = Math.max(user.kycTier, 1);
  user.onboardingStep = OnboardingStep.KYC;

  await userRepo().save(user);

  return {
    message: 'BVN verified successfully',
    kycTier: user.kycTier,
    onboardingStep: user.onboardingStep,
  };
}
