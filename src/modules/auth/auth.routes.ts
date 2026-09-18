import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../middlewares/validate';
import {
  initiatePhoneSchema,
  setPersonalDetailsSchema,
  setPinSchema,
  verifyPhoneOtpSchema,
} from './auth.validation';
import { requireAuth, requireOnboardingStep } from '../../middlewares/auth';
import { OnboardingStep } from '../user/user.entity';

const router = Router();

/**
 * @openapi
 * /auth/phone/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Send an OTP to a phone number to begin verification
 *     description: Accepts any common Nigerian phone format (0801..., 234801..., +234801...) and normalizes it to E.164 (+234801...) before sending.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+2348012345678"
 *     responses:
 *       200:
 *         description: OTP sent
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
 *                     phone: { type: string, example: "+2348012345678" }
 *                     message: { type: string, example: OTP sent }
 *       400:
 *         description: Invalid phone number format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: An account with this phone number already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post('/phone/initiate', validate(initiatePhoneSchema), authController.initiatePhone);

/**
 * @openapi
 * /auth/phone/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP and create the account skeleton
 *     description: Creates a User row with just the phone number, plus an empty wallet. Returns an onboarding-scoped access token — use it to call /auth/onboarding/personal-details next.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone: { type: string, example: "08012345678" }
 *               otp: { type: string, pattern: "^\\d{6}$", example: "123456" }
 *     responses:
 *       201:
 *         description: Phone verified, account skeleton created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/AuthResponse' } }
 *       400:
 *         description: OTP expired, incorrect, or too many attempts
 *       409:
 *         description: Phone number already registered
 */
router.post('/phone/verify', validate(verifyPhoneOtpSchema), authController.verifyPhone);

/**
 * @openapi
 * /auth/onboarding/personal-details:
 *   patch:
 *     tags: [Auth]
 *     summary: Set first name, last name, other name, and date of birth
 *     description: Second onboarding step. Requires the onboarding-scoped token returned by /auth/phone/verify.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, dob]
 *             properties:
 *               firstName: { type: string, example: Ada }
 *               lastName: { type: string, example: Obi }
 *               otherName: { type: string, example: Chioma }
 *               dob: { type: string, format: date, example: "1998-04-12" }
 *     responses:
 *       200:
 *         description: Personal details saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/AuthResponse' } }
 *       400:
 *         description: Invalid dob format or under minimum age
 *       401:
 *         description: Missing or invalid onboarding token
 */
router.patch(
  '/onboarding/personal-details',
  requireAuth,
  requireOnboardingStep(OnboardingStep.PHONE_VERIFICATION),
  validate(setPersonalDetailsSchema),
  authController.setPersonalDetails,
);

/**
 * @openapi
 * /auth/security-questions:
 *   get:
 *     tags: [Auth]
 *     summary: Get the list of selectable security questions
 *     security: []
 *     responses:
 *       200:
 *         description: List of security questions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: first_pet }
 *                       question: { type: string, example: "What was the name of your first pet?" }
 */
router.get('/security-questions', authController.listSecurityQuestions);

/**
 * @openapi
 * /auth/pin:
 *   post:
 *     tags: [Auth]
 *     summary: Set transaction PIN, confirm PIN, and security question — completes onboarding
 *     description: Final onboarding step. On success, onboardingStep becomes COMPLETED and the user gains full access to wallet/QR/transaction routes. Requires a token whose onboardingStep is KYC.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pin, confirmPin, securityQuestionId, securityAnswer]
 *             properties:
 *               pin: { type: string, pattern: "^\\d{4}$", example: "5170" }
 *               confirmPin: { type: string, pattern: "^\\d{4}$", example: "5170" }
 *               securityQuestionId:
 *                 type: string
 *                 enum: [first_pet, mother_maiden_name, birth_city, first_school, favorite_teacher, childhood_nickname]
 *               securityAnswer: { type: string, example: Max }
 *     responses:
 *       200:
 *         description: PIN and security question set, onboarding complete
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
 *                     onboardingStep: { type: string, example: completed }
 *       400:
 *         description: PIN/confirmPin mismatch, weak PIN, or invalid security question id
 */
router.post(
  '/pin',
  requireAuth,
  requireOnboardingStep(OnboardingStep.KYC),
  validate(setPinSchema),
  authController.setPin,
);
export default router;
