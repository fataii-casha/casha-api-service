import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { verifyBvnSchema } from './kyc.validation';
import * as kycController from './kyc.controller';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /kyc/bvn/verify:
 *   post:
 *     tags: [KYC]
 *     summary: Verify BVN via Dojah and advance onboarding
 *     description: Requires the onboarding-scoped token. Matches the BVN holder's name against firstName/lastName already on file from the personal-details step.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bvn]
 *             properties:
 *               bvn: { type: string, pattern: "^\\d{11}$", example: "22222222222" }
 *     responses:
 *       200:
 *         description: BVN verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *                     kycTier: { type: integer, example: 1 }
 *                     onboardingStage: { type: string, example: bvn_verified }
 *       400:
 *         description: Invalid BVN, record not found, or name mismatch
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: BVN already verified for this account
 *       503:
 *         description: Dojah service unavailable
 */
router.post('/bvn/verify', validate(verifyBvnSchema), kycController.verifyBvn);

export default router;
