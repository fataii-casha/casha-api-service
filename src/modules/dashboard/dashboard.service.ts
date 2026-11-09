import { getWalletWithAccountsByUserId, toWalletView } from '../wallet/wallet.service';
import { getRecentTransactions } from '../transaction/transaction.service';

const RECENT_TRANSACTIONS_LIMIT = 10;

/** Home screen data: wallet balances, the account number to fund it, and the latest transactions. */
export async function getDashboard(userId: string) {
  const wallet = await getWalletWithAccountsByUserId(userId);
  const recentTransactions = await getRecentTransactions(userId, RECENT_TRANSACTIONS_LIMIT);

  return {
    wallet: toWalletView(wallet),
    recentTransactions,
  };
}
