import { Router } from 'express';
import { requireAuth, requireFullAccess } from '../../middlewares/auth';
import * as dashboardController from './dashboard.controller';

const router = Router();

router.use(requireAuth, requireFullAccess);

/**
 * @openapi
 * /dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Home screen data — wallet balance, funding account and recent transactions
 *     description: Same shape for consumers and merchants. Requires completed onboarding. recentTransactions holds the latest 10 (all statuses); use GET /transactions for the full paginated history.
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
router.get('/', dashboardController.getDashboard);

export default router;
