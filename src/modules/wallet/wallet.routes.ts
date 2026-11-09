import { Router } from 'express';
import { requireAuth, requireOnboardingStep } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { mockFundSchema } from './wallet.validation';
import * as walletController from './wallet.controller';
import { OnboardingStep } from '../user/user.entity';
import { isProd } from '../../config/env';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /wallets:
 *   post:
 *     tags: [Wallet]
 *     summary: Create the user's wallet (only after BVN verification)
 *     description: Idempotent — returns the existing wallet with 200 if one already exists, or creates it and returns 201. Requires a token at the kyc step (BVN verified) — or create_wallet, for safe retries. Advances onboarding to create_wallet and returns the uniform session response (new token pair) plus the wallet. Same for consumers and merchants.
 *     responses:
 *       201:
 *         description: Wallet created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/SessionResponse'
 *                         - type: object
 *                           properties: { wallet: { $ref: '#/components/schemas/Wallet' } }
 *       200:
 *         description: Wallet already existed
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/SessionResponse'
 *                         - type: object
 *                           properties: { wallet: { $ref: '#/components/schemas/Wallet' } }
 *       403:
 *         description: BVN not yet verified, or wrong onboarding step for this action
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/',
  requireOnboardingStep([OnboardingStep.KYC, OnboardingStep.WALLET]),
  walletController.create,
);

/**
 * @openapi
 * /wallets/me:
 *   get:
 *     tags: [Wallet]
 *     summary: Get the current user's wallet (available + ledger balance, linked accounts)
 *     responses:
 *       200:
 *         description: Wallet fetched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       404:
 *         description: Wallet not found for this user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/me', walletController.getMyWallet);

/**
 * @openapi
 * /wallets/mock-fund:
 *   post:
 *     tags: [Wallet]
 *     summary: Dev-only wallet top-up (not registered in production)
 *     description: Posts a real funding transaction through the ledger, so it appears in the history with balance before/after.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, description: Amount in kobo, example: 500000 }
 *     responses:
 *       200:
 *         description: Wallet funded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       400:
 *         description: Destination wallet is not active
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
// Creates money out of thin air, so it never exists in production.
if (!isProd) {
  router.post('/mock-fund', validate(mockFundSchema), walletController.mockFund);
}

export default router;
