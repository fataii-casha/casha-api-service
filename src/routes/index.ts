import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import kycRoutes from '@/modules/kyc/kyc.routes';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, message: 'Casha API is up' }));

router.use('/auth', authRoutes);
router.use('/kyc', kycRoutes);
// router.use('/wallets', walletRoutes);
// router.use('/qr', qrRoutes);
// router.use('/transactions', transactionRoutes);

export default router;
