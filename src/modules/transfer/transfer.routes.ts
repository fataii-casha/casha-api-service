import { Router } from 'express';
import { requireAuth, requireFullAccess } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import {
  bankFeeSchema,
  recipientLookupSchema,
  sendBankTransferSchema,
  sendTransferSchema,
} from './transfer.validation';
import * as transferController from './transfer.controller';

const router = Router();

router.use(requireAuth, requireFullAccess);

/**
 * @openapi
 * /transfers/recipient:
 *   get:
 *     tags: [Transfer]
 *     summary: Look up a Casha recipient by phone number or account number (name enquiry)
 *     description: Send exactly one of phone or accountNumber. Returns the recipient to show on the confirm screen; send their id to POST /transfers. Limited to 30 lookups per 15 minutes per user. Unknown, inactive and not-yet-onboarded accounts all return the same 404.
 *     parameters:
 *       - in: query
 *         name: phone
 *         schema: { type: string, example: '08031234567' }
 *       - in: query
 *         name: accountNumber
 *         schema: { type: string, example: '9000081483' }
 *         description: The recipient's Casha (Stellas) account number
 *     responses:
 *       200:
 *         description: Recipient found
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/TransferRecipient' } }
 *       400:
 *         description: Invalid phone/account number, or it is your own account
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       404:
 *         description: No Casha account found for these details
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       429:
 *         description: Too many lookups
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/recipient', validate(recipientLookupSchema), transferController.lookupRecipient);

/**
 * @openapi
 * /transfers:
 *   post:
 *     tags: [Transfer]
 *     summary: Send money to another Casha user
 *     description: >-
 *       Instant and free. Debits the sender's main wallet (or fromWalletId, one of their stashes) and
 *       credits the recipient's main wallet. Requires the transaction PIN (5 wrong attempts lock it for
 *       15 minutes, shared with change-PIN). Enforces KYC-tier limits: minimum amount, per-transfer
 *       maximum, daily total (Africa/Lagos day), and the recipient's balance cap; 400s carry
 *       details.code. idempotencyKey is required — reuse it when retrying and the transfer can't
 *       happen twice (a repeat returns 200 with the original). Limited to 10 attempts per minute.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId, amount, pin, idempotencyKey]
 *             properties:
 *               recipientId: { type: string, format: uuid, description: From GET /transfers/recipient }
 *               amount: { type: integer, description: Kobo, example: 250000 }
 *               pin: { type: string, example: '5170' }
 *               idempotencyKey: { type: string, example: 3f1c2b9e-send-0001 }
 *               narration: { type: string, maxLength: 100, example: Lunch money }
 *               fromWalletId: { type: string, format: uuid, description: Defaults to the main wallet }
 *     responses:
 *       201:
 *         description: Transfer successful (200 "Transfer already processed" for a repeated idempotencyKey)
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
 *                         wallet: { $ref: '#/components/schemas/Wallet' }
 *                         recipient: { $ref: '#/components/schemas/TransferRecipient' }
 *       400:
 *         description: >-
 *           Validation failed, Incorrect PIN (INCORRECT_PIN), AMOUNT_TOO_SMALL, SINGLE_LIMIT_EXCEEDED,
 *           DAILY_LIMIT_EXCEEDED, RECIPIENT_LIMIT_EXCEEDED, Insufficient balance, sending to yourself,
 *           or an archived source stash
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       403:
 *         description: Onboarding incomplete, account restricted, or BVN not verified
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       404:
 *         description: Recipient (or fromWalletId) not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: idempotencyKey already used for a different transfer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       429:
 *         description: PIN locked, or too many transfers in a short time
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post('/', validate(sendTransferSchema), transferController.send);

/**
 * @openapi
 * /transfers/banks:
 *   get:
 *     tags: [Transfer]
 *     summary: Banks you can send to, with their NIBSS codes
 *     description: Sorted by name, cached for 6 hours. Use bankCode in POST /transfers/bank.
 *     responses:
 *       200:
 *         description: Banks fetched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string, example: Access Bank }
 *                           bankCode: { type: string, example: '000014' }
 *       503:
 *         description: Banking service unavailable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/banks', transferController.listBanks);

/**
 * @openapi
 * /transfers/bank/fee:
 *   get:
 *     tags: [Transfer]
 *     summary: Fee for a bank transfer of this amount
 *     description: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above. Charged on top of the amount.
 *     parameters:
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: integer, description: Kobo, example: 250000 }
 *     responses:
 *       200:
 *         description: Fee calculated
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
 *                         amount: { type: integer, example: 250000 }
 *                         fee: { type: integer, example: 1000 }
 *                         total: { type: integer, example: 251000 }
 */
router.get('/bank/fee', validate(bankFeeSchema), transferController.bankFee);

/**
 * @openapi
 * /transfers/bank:
 *   post:
 *     tags: [Transfer]
 *     summary: Send money to any Nigerian bank account (NIP)
 *     description: >-
 *       Paid from the sender's Casha account (main wallet by default, or fromWalletId). amount + fee is
 *       held immediately; the result is 201 (successful), 202 (processing at the bank — the money stays
 *       held until the bank confirms, then the transaction becomes success or failed and failed refunds
 *       amount + fee), or 400 TRANSFER_FAILED (refunded). Same PIN, rate-limit, KYC-tier and daily
 *       limits as Casha transfers (bank transfers count towards the same daily total). idempotencyKey
 *       is required; a repeat never re-sends and returns 200 with the current status. Casha account
 *       numbers are refused (CASHA_ACCOUNT) — send those as a free Casha transfer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accountNumber, bankCode, amount, pin, idempotencyKey]
 *             properties:
 *               accountNumber: { type: string, example: '0123456789' }
 *               bankCode: { type: string, description: NIBSS code from GET /transfers/banks, example: '000014' }
 *               amount: { type: integer, description: Kobo, excluding the fee, example: 250000 }
 *               pin: { type: string, example: '5170' }
 *               idempotencyKey: { type: string, example: 9b2e4c1a-bank-0001 }
 *               narration: { type: string, maxLength: 100, description: 'Shown on the recipient''s statement. Default "Transfer from {name} via Casha"' }
 *               fromWalletId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Transfer successful (202 while still processing at the bank; 200 for a repeated idempotencyKey)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/BankTransferResult' } }
 *       400:
 *         description: >-
 *           Validation failed, INCORRECT_PIN, AMOUNT_TOO_SMALL, SINGLE_LIMIT_EXCEEDED,
 *           DAILY_LIMIT_EXCEEDED, UNKNOWN_BANK, CASHA_ACCOUNT (details.recipientId), OWN_ACCOUNT,
 *           Insufficient balance (amount + fee), or TRANSFER_FAILED (refunded; details.transaction)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       403:
 *         description: Onboarding incomplete, account restricted, or BVN not verified
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       409:
 *         description: idempotencyKey already used for a different transaction, or the account number isn't set up
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       429:
 *         description: PIN locked, or too many bank transfers (5 a minute)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       503:
 *         description: Banking service unavailable — nothing was sent and the hold was released
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.post('/bank', validate(sendBankTransferSchema), transferController.sendToBank);

export default router;
