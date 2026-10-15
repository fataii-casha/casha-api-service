import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import * as userController from './user.controller';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [User]
 *     summary: Get the current user's profile
 *     description: Works with any valid token, including onboarding-stage tokens, for consumers and merchants alike. Returns the uniform account shape — use onboarding.currentStep / onboarding.nextStep (and user.bvnVerified, user.hasWallet) to decide which screen to show.
 *     responses:
 *       200:
 *         description: Profile fetched
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
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiErrorResponse' }
 */
router.get('/me', userController.getMe);

export default router;
