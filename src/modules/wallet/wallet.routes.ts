import { Router } from 'express';
import { requireAuth, requireFullAccess, requireOnboardingStep } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
  createStashSchema,
  mockFundSchema,
  updateWalletSchema,
  walletIdSchema,
  walletTransferSchema,
} from './wallet.validation';
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

/**
 * @openapi
 * /wallets:
 *   get:
 *     tags: [Wallet]
 *     summary: List the user's wallets (main + stashes)
 *     description: Main first, then stashes oldest first. By default returns main and non-archived stashes. With archived=true, only archived stashes, including deleted ones still in their 30-day restore window (check deletionScheduledAt).
 *     parameters:
 *       - in: query
 *         name: archived
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Wallets fetched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Wallet' } }
 */
router.get('/', requireFullAccess, walletController.list);

/**
 * @openapi
 * /wallets/stashes:
 *   post:
 *     tags: [Wallet]
 *     summary: Create a stash (sub-wallet)
 *     description: Starts empty. Name 1–30 characters, unique per user ignoring case (the main wallet's name included). color is a #RRGGBB hex code; icon is a key from the app's icon set. Up to 20 stashes per user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Rent }
 *               color: { type: string, example: '#4F46E5' }
 *               icon: { type: string, example: house }
 *     responses:
 *       201:
 *         description: Stash created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       400:
 *         description: Validation failed, or the stash limit is reached
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: A wallet with this name already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/stashes',
  requireFullAccess,
  validate(createStashSchema),
  walletController.createStash,
);

/**
 * @openapi
 * /wallets/transfers:
 *   post:
 *     tags: [Wallet]
 *     summary: Move money between your own wallets (main ↔ stash, stash ↔ stash)
 *     description: Settles immediately and appears in both wallets' history as a wallet_transfer. Archived or deleted stashes can't send or receive. Send an idempotencyKey and reuse it on retry, so the move can't happen twice; a repeat returns 200 with the original transaction.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromWalletId, toWalletId, amount]
 *             properties:
 *               fromWalletId: { type: string, format: uuid }
 *               toWalletId: { type: string, format: uuid }
 *               amount: { type: integer, description: Kobo, example: 500000 }
 *               narration: { type: string, example: Saving for rent }
 *               idempotencyKey: { type: string, example: 7f3c9a2e-move-1 }
 *     responses:
 *       201:
 *         description: Money moved (200 if this idempotencyKey was already processed)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transaction: { $ref: '#/components/schemas/TransactionView' }
 *                         from: { $ref: '#/components/schemas/Wallet' }
 *                         to: { $ref: '#/components/schemas/Wallet' }
 *       400:
 *         description: Insufficient balance, archived wallet, or validation failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       404:
 *         description: Wallet not found (or not yours)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/transfers',
  requireFullAccess,
  validate(walletTransferSchema),
  walletController.transfer,
);

/**
 * @openapi
 * /wallets/{walletId}:
 *   get:
 *     tags: [Wallet]
 *     summary: Get one wallet (main or stash)
 *     description: Archived and pending-deletion stashes can still be fetched.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
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
 *         description: Wallet not found (or not yours, or permanently deleted)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *   patch:
 *     tags: [Wallet]
 *     summary: Rename a wallet or change its colour/icon
 *     description: Works for the main wallet and stashes. Send any of name, color, icon. null for color/icon resets it to the app default.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: Holiday }
 *               color: { type: string, nullable: true, example: '#F59E0B' }
 *               icon: { type: string, nullable: true, example: plane }
 *     responses:
 *       200:
 *         description: Wallet updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       409:
 *         description: A wallet with this name already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *   delete:
 *     tags: [Wallet]
 *     summary: Delete a stash (restorable for 30 days)
 *     description: Moves any balance to the main wallet (a wallet_transfer, shown in both histories), then archives the stash and schedules permanent deletion in 30 days (deletionScheduledAt). Until then, POST /wallets/{walletId}/restore brings it back. Idempotent. The main wallet can't be deleted.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Stash deleted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         wallet: { $ref: '#/components/schemas/Wallet' }
 *                         movedToMain: { type: integer, description: Kobo moved to the main wallet, example: 250000 }
 *       400:
 *         description: This is the main wallet
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: A transaction on the stash is still in progress
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/:walletId', requireFullAccess, validate(walletIdSchema), walletController.getOne);
router.patch(
  '/:walletId',
  requireFullAccess,
  validate(updateWalletSchema),
  walletController.update,
);
router.delete('/:walletId', requireFullAccess, validate(walletIdSchema), walletController.remove);

/**
 * @openapi
 * /wallets/{walletId}/archive:
 *   post:
 *     tags: [Wallet]
 *     summary: Archive a stash
 *     description: Hides it from the main list and freezes it (no money in or out) until it is unarchived. The balance stays in the stash. Idempotent. The main wallet can't be archived.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Stash archived
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       400:
 *         description: This is the main wallet
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: The stash is being deleted (restore it first)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/:walletId/archive',
  requireFullAccess,
  validate(walletIdSchema),
  walletController.archive,
);

/**
 * @openapi
 * /wallets/{walletId}/unarchive:
 *   post:
 *     tags: [Wallet]
 *     summary: Unarchive a stash
 *     description: Makes it usable again. Idempotent. For a deleted stash, use restore instead.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Stash unarchived
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       409:
 *         description: The stash is being deleted (use restore)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/:walletId/unarchive',
  requireFullAccess,
  validate(walletIdSchema),
  walletController.unarchive,
);

/**
 * @openapi
 * /wallets/{walletId}/restore:
 *   post:
 *     tags: [Wallet]
 *     summary: Restore a deleted stash within its 30 days
 *     description: The stash comes back active. Its money moved to main when it was deleted, so it is empty; move money back with POST /wallets/transfers. After 30 days it's a 404.
 *     parameters:
 *       - { in: path, name: walletId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Stash restored
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Wallet' } }
 *       400:
 *         description: The stash is not deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       404:
 *         description: Wallet not found, or its 30 days have passed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post(
  '/:walletId/restore',
  requireFullAccess,
  validate(walletIdSchema),
  walletController.restore,
);

export default router;
