import { Request, Response } from 'express';
import { getHealthReport } from './health.service';

export async function check(res: Response) {
  const report = await getHealthReport();
  const statusCode = report.status === 'up' ? 200 : 503;
  return res.status(statusCode).json({ success: report.status === 'up', data: report });
}
