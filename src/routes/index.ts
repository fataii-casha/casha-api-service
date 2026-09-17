import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import kycRoutes from '../modules/kyc/kyc.routes';
import * as healthController from '../modules/health/health.controller';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness/readiness check for API, database, Redis, and Dojah
 *     security: []
 *     responses:
 *       200:
 *         description: All critical dependencies are up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, enum: [up, down] }
 *                     uptimeSeconds: { type: integer }
 *                     timestamp: { type: string, format: date-time }
 *                     components:
 *                       type: object
 *                       properties:
 *                         database:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [up, down] }
 *                             latencyMs: { type: integer }
 *                         redis:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [up, down] }
 *                             latencyMs: { type: integer }
 *                         dojah:
 *                           type: object
 *                           properties:
 *                             status: { type: string, enum: [up, down] }
 *                             latencyMs: { type: integer }
 *       503:
 *         description: Database or Redis is unreachable
 */
router.get('/health', healthController.check);

router.use('/auth', authRoutes);
router.use('/kyc', kycRoutes);
// router.use('/wallets', walletRoutes);
// router.use('/qr', qrRoutes);
// router.use('/transactions', transactionRoutes);

export default router;
