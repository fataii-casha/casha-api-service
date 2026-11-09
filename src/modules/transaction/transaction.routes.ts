import { Router } from 'express';
import { requireAuth, requireFullAccess } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { listTransactionsSchema } from './transaction.validation';
import * as transactionController from './transaction.controller';

const router = Router();

router.use(requireAuth, requireFullAccess);

/**
 * @openapi
 * /transactions:
 *   get:
 *     tags: [Transaction]
 *     summary: Paginated transaction history of one wallet, newest first
 *     description: Every transaction into or out of the wallet (main by default, or a stash via walletId), all statuses. direction and balanceBefore/After are relative to that wallet. Archived and pending-deletion stashes can still be viewed.
 *     parameters:
 *       - in: query
 *         name: walletId
 *         schema: { type: string, format: uuid }
 *         description: Defaults to the main wallet. Another user's wallet is a 404.
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Transactions fetched
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
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/TransactionView' }
 *                         total: { type: integer, example: 42 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 20 }
 *                         totalPages: { type: integer, example: 3 }
 *       400:
 *         description: Invalid page or limit
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       403:
 *         description: Onboarding not complete
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/', validate(listTransactionsSchema), transactionController.listMine);

export default router;
