import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

interface SwaggerServer {
  url: string;
  description: string;
}

function buildServers(): SwaggerServer[] {
  const servers: SwaggerServer[] = [];

  if (env.apiUrl) {
    servers.push({
      url: env.apiUrl,
      description: 'Local',
    });
  }

  if (env.stagingApiUrl) {
    servers.push({
      url: env.stagingApiUrl,
      description: 'Staging',
    });
  }

  if (env.productionApiUrl) {
    servers.push({
      url: env.productionApiUrl,
      description: 'Production',
    });
  }

  return servers;
}

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',

    info: {
      title: 'Casha API',
      version: '0.1.0',
      description:
        'QR-based digital wallet for everyday in-person payments in Nigeria — scan-to-pay for consumers and merchants.',
    },

    servers: buildServers(),

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },

      schemas: {
        ApiErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Something went wrong',
            },
            details: {
              type: 'object',
              nullable: true,
            },
          },
        },

        UserRole: {
          type: 'string',
          enum: ['consumer', 'merchant'],
          example: 'consumer',
        },

        OnboardingStep: {
          type: 'string',
          enum: [
            'phone_verification',
            'profile',
            'business_info',
            'business_documents',
            'business_address',
            'business_logo',
            'owner_details',
            'kyc',
            'set_pin',
            'create_wallet',
            'completed',
          ],
        },

        User: {
          type: 'object',
          description:
            'Public user representation. Sensitive credential hashes are never returned.',

          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },

            phone: {
              type: 'string',
              example: '+2348012345678',
            },

            isPhoneVerified: {
              type: 'boolean',
              example: true,
            },

            firstName: {
              type: 'string',
              nullable: true,
              example: 'Ada',
            },

            lastName: {
              type: 'string',
              nullable: true,
              example: 'Obi',
            },

            otherName: {
              type: 'string',
              nullable: true,
              example: 'Chiamaka',
            },

            dob: {
              type: 'string',
              nullable: true,
              example: '1998-04-12',
            },

            email: {
              type: 'string',
              format: 'email',
              nullable: true,
              example: 'ada@example.com',
            },

            isEmailVerified: {
              type: 'boolean',
              example: false,
            },

            role: {
              $ref: '#/components/schemas/UserRole',
              nullable: true,
            },

            businessName: {
              type: 'string',
              nullable: true,
              example: 'Ada Foods Ltd',
            },

            bvnVerified: {
              type: 'boolean',
              example: true,
            },

            bvnLast4: {
              type: 'string',
              nullable: true,
              example: '7890',
              description: 'Last four digits of the user BVN.',
            },

            kycTier: {
              type: 'integer',
              example: 1,
              minimum: 0,
            },

            isActive: {
              type: 'boolean',
              example: true,
            },

            isPoliticallyExposed: {
              type: 'boolean',
              nullable: true,
              example: false,
            },

            onboardingStep: {
              $ref: '#/components/schemas/OnboardingStep',
            },

            securityQuestionId: {
              type: 'string',
              nullable: true,
              example: 'security-question-1',
              description:
                'Identifier of the selected security question. The security answer itself is never returned.',
            },

            createdAt: {
              type: 'string',
              format: 'date-time',
            },

            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        WalletAccount: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            provider: { type: 'string', example: 'stellas' },
            accountNumber: { type: 'string', example: '9000081483' },
            accountName: { type: 'string', example: 'Ada Lovelace' },
            bankName: { type: 'string', example: 'Stellas Microfinance Bank' },
            bankCode: { type: 'string' },
            isPrimary: { type: 'boolean', example: true },
          },
        },

        Wallet: {
          type: 'object',
          description:
            'A main wallet or a stash. Same shape from every wallet endpoint and the dashboard. Balances are kobo.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: {
              type: 'string',
              enum: ['main', 'stash'],
              description:
                'main: created at onboarding, holds the funding account number, one per user. stash: a user-created sub-wallet.',
            },
            name: { type: 'string', example: 'Rent' },
            color: {
              type: 'string',
              nullable: true,
              example: '#4F46E5',
              description: 'null = app default',
            },
            icon: {
              type: 'string',
              nullable: true,
              example: 'house',
              description: 'Key from the app icon set; null = app default',
            },
            availableBalance: {
              type: 'integer',
              description:
                'What the user can spend right now: ledgerBalance minus funds on hold for transactions still in progress (e.g. a bank withdrawal awaiting confirmation). Show this as the main balance.',
              example: 400000,
            },
            ledgerBalance: {
              type: 'integer',
              description:
                'Booked balance: every settled transaction. Equal to availableBalance unless something is on hold.',
              example: 500000,
            },
            currency: { type: 'string', example: 'NGN' },
            status: { type: 'string', enum: ['active', 'suspended', 'closed'], example: 'active' },
            isArchived: {
              type: 'boolean',
              description: 'Archived stashes are hidden and frozen: no money in or out.',
            },
            archivedAt: { type: 'string', format: 'date-time', nullable: true },
            deletionScheduledAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'Set on a deleted stash: it can be restored until this time, then it is gone for good.',
            },
            fundingAccount: {
              nullable: true,
              description:
                'The primary linked account — the account number the user transfers to, to fund the wallet.',
              allOf: [{ $ref: '#/components/schemas/WalletAccount' }],
            },
            accounts: {
              type: 'array',
              description: 'All bank accounts linked to the wallet.',
              items: { $ref: '#/components/schemas/WalletAccount' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        TransactionView: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            reference: { type: 'string' },
            type: {
              type: 'string',
              enum: [
                'qr_payment',
                'funding',
                'withdrawal',
                'p2p_transfer',
                'wallet_transfer',
                'reversal',
              ],
            },
            direction: {
              type: 'string',
              enum: ['credit', 'debit'],
              description: 'credit = money in for the current user, debit = money out.',
            },
            amount: { type: 'integer', description: 'Amount in kobo.', example: 250000 },
            currency: { type: 'string', example: 'NGN' },
            status: { type: 'string', enum: ['pending', 'success', 'failed', 'reversed'] },
            balanceBefore: {
              type: 'integer',
              nullable: true,
              description:
                "The user's ledger balance (kobo) just before this transaction posted. null while pending, and for failed transactions (nothing moved).",
              example: 750000,
            },
            balanceAfter: {
              type: 'integer',
              nullable: true,
              description:
                "The user's ledger balance (kobo) just after. Same null rules as balanceBefore.",
              example: 500000,
            },
            narration: { type: 'string', nullable: true },
            failureReason: { type: 'string', nullable: true },
            counterparty: {
              type: 'object',
              nullable: true,
              description:
                'The other side: another Casha user (kind user), or for moves between your own wallets the other wallet (kind wallet). null for bank funding and withdrawals.',
              properties: {
                kind: { type: 'string', enum: ['user', 'wallet'] },
                id: { type: 'string', format: 'uuid', description: 'User id or wallet id' },
                name: { type: 'string', example: "Ada's Kitchen" },
              },
            },
            walletId: {
              type: 'string',
              format: 'uuid',
              description:
                'The wallet this row is viewed from (direction and balances are for it).',
            },
            parentTransactionId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description:
                'For a reversal: the transaction it reverses (which now has status reversed).',
            },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When it reached a final status. null while pending.',
            },
          },
        },

        Dashboard: {
          type: 'object',
          properties: {
            wallet: {
              description: 'The active wallet (walletId, default main).',
              allOf: [{ $ref: '#/components/schemas/Wallet' }],
            },
            wallets: {
              type: 'array',
              description: 'For the wallet switcher: main first, then non-archived stashes.',
              items: { $ref: '#/components/schemas/Wallet' },
            },
            totalAvailableBalance: {
              type: 'integer',
              description:
                'Sum of availableBalance across all wallets, archived stashes included. Kobo.',
              example: 750000,
            },
            recentTransactions: {
              type: 'array',
              description: 'Latest 10 transactions of the active wallet, newest first.',
              items: { $ref: '#/components/schemas/TransactionView' },
            },
          },
        },

        AccountUser: {
          type: 'object',
          description:
            'Public user representation. Sensitive credential hashes are never returned.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            displayName: {
              type: 'string',
              example: 'Ada Obi',
              description: 'Business name for merchants, full name otherwise.',
            },
            firstName: { type: 'string', nullable: true, example: 'Ada' },
            lastName: { type: 'string', nullable: true, example: 'Obi' },
            otherName: { type: 'string', nullable: true },
            dob: { type: 'string', nullable: true, example: '1998-04-12' },
            phone: { type: 'string', example: '+2348012345678' },
            isPhoneVerified: { type: 'boolean' },
            email: { type: 'string', format: 'email', nullable: true },
            isEmailVerified: { type: 'boolean' },
            role: { $ref: '#/components/schemas/UserRole', nullable: true },
            businessName: { type: 'string', nullable: true },
            bvnVerified: { type: 'boolean' },
            bvnLast4: { type: 'string', nullable: true, example: '7890' },
            kycTier: { type: 'integer', example: 1 },
            isActive: { type: 'boolean' },
            isPoliticallyExposed: { type: 'boolean', nullable: true },
            hasWallet: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        Onboarding: {
          type: 'object',
          properties: {
            currentStep: { $ref: '#/components/schemas/OnboardingStep' },
            nextStep: {
              allOf: [{ $ref: '#/components/schemas/OnboardingStep' }],
              nullable: true,
              description:
                'The step the client should complete next (role-aware), or null when done.',
            },
            nextAction: {
              type: 'string',
              nullable: true,
              example: 'POST /merchants/documents',
              description: 'Human-readable hint of the endpoint to call next.',
            },
            isCompleted: { type: 'boolean' },
          },
        },

        BusinessProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            businessName: { type: 'string' },
            industry: { type: 'string' },
            isRegistered: { type: 'boolean' },
            rcNumber: { type: 'string', nullable: true },
            addressLine1: { type: 'string', nullable: true },
            addressLine2: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', nullable: true },
            country: { type: 'string', example: 'Nigeria' },
            logoUrl: { type: 'string', nullable: true },
            verificationStatus: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  documentType: {
                    type: 'string',
                    enum: [
                      'cac_certificate',
                      'cac_status_report',
                      'proof_of_address',
                      'owner_valid_id',
                    ],
                  },
                  fileUrl: { type: 'string', example: '/uploads/171234-abc.pdf' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        AccountResponse: {
          type: 'object',
          description:
            'Uniform account shape returned by profile endpoints for both consumers and merchants.',
          properties: {
            user: { $ref: '#/components/schemas/AccountUser' },
            business: {
              allOf: [{ $ref: '#/components/schemas/BusinessProfile' }],
              nullable: true,
              description:
                'Always null for consumers; null for merchants until business info is saved.',
            },
            onboarding: { $ref: '#/components/schemas/Onboarding' },
          },
        },

        SessionResponse: {
          description:
            'AccountResponse plus a fresh token pair. Returned by every endpoint that advances onboarding — replace the stored accessToken, since onboarding guards read the step from it.',
          allOf: [
            { $ref: '#/components/schemas/AccountResponse' },
            {
              type: 'object',
              properties: {
                accessToken: { type: 'string', description: 'JWT access token.' },
                refreshToken: { type: 'string', description: 'JWT refresh token.' },
              },
            },
          ],
        },
      },
    },

    security: [
      {
        bearerAuth: [],
      },
    ],
  },

  // Every route file with `@openapi` JSDoc blocks gets picked up here.
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
