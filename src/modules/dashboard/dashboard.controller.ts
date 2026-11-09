import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as dashboardService from './dashboard.service';

export async function getDashboard(req: Request, res: Response) {
  const dashboard = await dashboardService.getDashboard(
    req.user!.id,
    req.query.walletId as string | undefined,
  );
  return sendSuccess(res, dashboard, 'Dashboard fetched');
}
