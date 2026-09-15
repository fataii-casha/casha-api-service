import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../middlewares/validate';
import {
  initiatePhoneSchema,
  setPersonalDetailsSchema,
  verifyPhoneOtpSchema,
} from './auth.validation';
import { requireAuth } from '@/middlewares/auth';

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
  validate(setPersonalDetailsSchema),
  authController.setPersonalDetails,
);

/**
 * @openapi
 * /auth/pin:
 *   post:
 *     tags: [Auth]
 *     summary: Set the 4-digit transaction PIN
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pin]
 *             properties:
 *               pin: { type: string, pattern: "^\\d{4}$", example: "1234" }
 *     responses:
 *       200:
 *         description: PIN set successfully
 */
// router.post('/pin', requireAuth, validate(setPinSchema), authController.setPin);
export default router;
