import { AppDataSource } from '../../config/data-source';
import { User } from './user.entity';
import { ApiError } from '../../utils/api-error';
import { buildAccountResponse } from './account-response';

const userRepo = () => AppDataSource.getRepository(User);

export async function getProfile(userId: string) {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return buildAccountResponse(user);
}
