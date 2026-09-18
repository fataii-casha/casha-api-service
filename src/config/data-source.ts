import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env, isProd } from './env';
import { User } from '../modules/user/user.entity';
import { Wallet } from '../modules/wallet/wallet.entity';
import { WalletAccount } from '../modules/wallet/walletAccount.entity';
import { QrCode } from '../modules/qr/qr.entity';
import { Transaction } from '../modules/transaction/transaction.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.dbHost,
  port: env.dbPort,
  username: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  entities: [User, Wallet, WalletAccount, QrCode, Transaction],
  migrations: ['src/migrations/*.ts'],
  // synchronize is convenient for early local dev but unsafe past that — switch to
  // migrations (see the scripts below) once the schema stabilizes.
  synchronize: false,
  logging: !isProd ? ['error', 'warn'] : ['error'],
});
