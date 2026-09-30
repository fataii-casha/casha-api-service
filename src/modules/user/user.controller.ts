import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as userService from './user.service';

export async function getMe(req: Request, res: Response) {
  const profile = await userService.getProfile(req.user!.id);
  return sendSuccess(res, profile, 'Profile fetched');
}
