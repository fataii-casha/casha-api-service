import { Router } from 'express';
import { requireAuth, requireOnboardingStep, requireRole } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { upload } from '../../middlewares/upload';
import { OnboardingStep, UserRole } from '../user/user.entity';
import { BusinessDocumentType } from './business-document.entity';
import {
  businessInfoSchema,
  businessDocumentsSchema,
  businessAddressSchema,
  ownerDetailsSchema,
} from './merchant.validation';
import * as merchantController from './merchant.controller';

const router = Router();

router.use(requireAuth, requireRole(UserRole.MERCHANT));

/**
 * @openapi
 * /merchants/business-info:
 *   patch:
 *     tags: [Merchant]
 *     summary: Tell us about your business — name, industry, registered?
 *     description: First merchant onboarding step after phone verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessName, industry, isRegistered]
 *             properties:
 *               businessName: { type: string, example: Ada's Kitchen }
 *               industry: { type: string, example: Food & Beverage }
 *               isRegistered: { type: boolean, description: Is this a CAC-registered business? }
 *     responses:
 *       200:
 *         description: Business info saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/SessionResponse' } }
 *       403:
 *         description: Wrong onboarding step, or not a merchant account
 */
router.patch(
  '/business-info',
  requireOnboardingStep(OnboardingStep.PHONE_VERIFICATION),
  validate(businessInfoSchema),
  merchantController.setBusinessInfo,
);

/**
 * @openapi
 * /merchants/documents:
 *   post:
 *     tags: [Merchant]
 *     summary: Submit RC number and upload the 4 business documents
 *     description: Only required for registered businesses (isRegistered=true from the previous step) — unregistered businesses can call this with no body/files to advance. multipart/form-data with 4 file fields, one per document type.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               rcNumber: { type: string, example: RC1234567, description: Required if the business is registered }
 *               cac_certificate: { type: string, format: binary }
 *               cac_status_report: { type: string, format: binary }
 *               proof_of_address: { type: string, format: binary }
 *               owner_valid_id: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Business documents saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/SessionResponse' } }
 *       400:
 *         description: Missing rcNumber or one of the 4 required documents for a registered business
 */
router.post(
  '/documents',
  requireOnboardingStep(OnboardingStep.BUSINESS_INFO),
  upload.fields(Object.values(BusinessDocumentType).map((type) => ({ name: type, maxCount: 1 }))),
  validate(businessDocumentsSchema),
  merchantController.uploadDocuments,
);

/**
 * @openapi
 * /merchants/address:
 *   patch:
 *     tags: [Merchant]
 *     summary: Set the business address
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [addressLine1, city, state]
 *             properties:
 *               addressLine1: { type: string, example: "12 Admiralty Way" }
 *               addressLine2: { type: string, example: "Suite 4B" }
 *               city: { type: string, example: Lekki }
 *               state: { type: string, example: Lagos }
 *               country: { type: string, example: Nigeria, default: Nigeria }
 *     responses:
 *       200:
 *         description: Business address saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/SessionResponse' } }
 */
router.patch(
  '/address',
  requireOnboardingStep(OnboardingStep.BUSINESS_DOCUMENTS),
  validate(businessAddressSchema),
  merchantController.setBusinessAddress,
);

/**
 * @openapi
 * /merchants/logo:
 *   post:
 *     tags: [Merchant]
 *     summary: Upload the business logo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Logo uploaded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/SessionResponse' } }
 *       400:
 *         description: Logo file is required
 */
router.post(
  '/logo',
  requireOnboardingStep(OnboardingStep.BUSINESS_ADDRESS),
  upload.single('logo'),
  merchantController.uploadLogo,
);

/**
 * @openapi
 * /merchants/owner-details:
 *   patch:
 *     tags: [Merchant]
 *     summary: Provide the business owner's personal details
 *     description: Last step before BVN verification. isPoliticallyExposed drives enhanced due diligence downstream.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, dob, isPoliticallyExposed]
 *             properties:
 *               firstName: { type: string, example: Ada }
 *               lastName: { type: string, example: Obi }
 *               otherName: { type: string, example: Chioma }
 *               dob: { type: string, format: date, example: "1985-02-10" }
 *               isPoliticallyExposed: { type: boolean }
 *     responses:
 *       200:
 *         description: Owner details saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/SessionResponse' } }
 */
router.patch(
  '/owner-details',
  requireOnboardingStep(OnboardingStep.BUSINESS_LOGO),
  validate(ownerDetailsSchema),
  merchantController.setOwnerDetails,
);

/**
 * @openapi
 * /merchants/me:
 *   get:
 *     tags: [Merchant]
 *     summary: Get the current merchant's business profile and onboarding progress
 *     description: Works at any onboarding step. Returns the same account shape as GET /users/me. business is null until the business-info step is completed. Use onboarding.currentStep and onboarding.nextStep to decide which screen to show.
 *     responses:
 *       200:
 *         description: Business and onboarding state fetched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/AccountResponse' } }
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       403:
 *         description: Not a merchant account
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/me', merchantController.getMyBusiness);

export default router;
