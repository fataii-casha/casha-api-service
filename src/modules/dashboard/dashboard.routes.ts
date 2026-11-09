import { Router } from 'express';
import { requireAuth, requireFullAccess } from '../../middlewares/auth';
import * as dashboardController from './dashboard.controller';
import { validate } from '../../middlewares/validate';
import { dashboardQuerySchema } from './dashboard.validation';

const router = Router();

router.use(requireAuth, requireFullAccess);

/**
 * @openapi
 * /dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Home screen data — active wallet, wallet switcher list and recent transactions
 *     description: Same shape for consumers and merchants. Requires completed onboarding. wallet and recentTransactions (latest 10, all statuses) are for the active wallet — pass walletId (main or a stash), default main. Use GET /transactions?walletId= for the full paginated history.
 *     parameters:
 *       - in: query
 *         name: walletId
 *         required: false
 *         schema: { type: string, format: uuid }
 *         description: The active wallet. Defaults to the main wallet. Another user's wallet is a 404.
 *     responses:
 *       200:
 *         description: Dashboard fetched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties: { success: { type: boolean }, message: { type: string } }
 *                 - type: object
 *                   properties: { data: { $ref: '#/components/schemas/Dashboard' } }
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       403:
 *         description: Onboarding not complete
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/', validate(dashboardQuerySchema), dashboardController.getDashboard);

export default router;
