import { getUserWallet, listUserWallets, toWalletView } from '../wallet/wallet.service';
import { WalletType } from '../wallet/wallet.entity';
import { getRecentTransactions } from '../transaction/transaction.service';
import { ApiError } from '../../utils/api-error';

const RECENT_TRANSACTIONS_LIMIT = 10;

/**
 * Home screen data. `wallet` and `recentTransactions` are for the active wallet — the one
 * the user has selected in the app (walletId), defaulting to main. `wallets` feeds the
 * wallet switcher: main plus non-archived stashes.
 */
export async function getDashboard(userId: string, walletId?: string) {
  const wallets = await listUserWallets(userId);
  const main = wallets.find((wallet) => wallet.type === WalletType.MAIN);
  if (!main) {
    throw ApiError.notFound('Wallet not found for this user');
  }

  const active = walletId ? await getUserWallet(userId, walletId) : main;
  const recentTransactions = await getRecentTransactions(active.id, RECENT_TRANSACTIONS_LIMIT);

  // Everything the user holds, archived stashes included.
  const totalAvailableBalance = wallets.reduce((sum, w) => sum + Number(w.availableBalance), 0);

  return {
    wallet: toWalletView(active),
    wallets: wallets.filter((wallet) => !wallet.archivedAt).map(toWalletView),
    totalAvailableBalance,
    recentTransactions,
  };
}
