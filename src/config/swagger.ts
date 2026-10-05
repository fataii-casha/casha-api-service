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

        AuthResponse: {
          type: 'object',

          properties: {
            user: {
              $ref: '#/components/schemas/User',
            },

            accessToken: {
              type: 'string',
              description: 'JWT access token.',
            },

            refreshToken: {
              type: 'string',
              description: 'JWT refresh token.',
            },
          },
        },

        Wallet: {
          type: 'object',

          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },

            userId: {
              type: 'string',
              format: 'uuid',
            },

            balance: {
              type: 'integer',
              description: 'Wallet balance in kobo.',
              example: 500000,
            },

            currency: {
              type: 'string',
              example: 'NGN',
            },

            status: {
              type: 'string',
              enum: ['active', 'suspended', 'closed'],
              example: 'active',
            },

            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },

        UserProfile: {
          type: 'object',

          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },

            displayName: {
              type: 'string',
              example: 'Ada Obi',
            },

            firstName: {
              type: 'string',
              nullable: true,
            },

            lastName: {
              type: 'string',
              nullable: true,
            },

            otherName: {
              type: 'string',
              nullable: true,
            },

            dob: {
              type: 'string',
              nullable: true,
              example: '1998-04-12',
            },

            phone: {
              type: 'string',
              example: '+2348012345678',
            },

            isPhoneVerified: {
              type: 'boolean',
            },

            email: {
              type: 'string',
              format: 'email',
              nullable: true,
            },

            isEmailVerified: {
              type: 'boolean',
            },

            role: {
              $ref: '#/components/schemas/UserRole',
              nullable: true,
            },

            businessName: {
              type: 'string',
              nullable: true,
            },

            bvnVerified: {
              type: 'boolean',
            },

            bvnLast4: {
              type: 'string',
              nullable: true,
              example: '7890',
            },

            kycTier: {
              type: 'integer',
              example: 1,
            },

            isActive: {
              type: 'boolean',
            },

            isPoliticallyExposed: {
              type: 'boolean',
              nullable: true,
            },

            hasWallet: {
              type: 'boolean',
            },

            onboardingStep: {
              $ref: '#/components/schemas/OnboardingStep',
            },

            nextStep: {
              type: 'string',
              nullable: true,
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
              description:
                'The onboarding step the client should complete next, or null if onboarding is complete.',
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

        Business: {
          type: 'object',

          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },

            ownerId: {
              type: 'string',
              format: 'uuid',
            },

            businessName: {
              type: 'string',
            },

            industry: {
              type: 'string',
            },

            isRegistered: {
              type: 'boolean',
            },

            rcNumber: {
              type: 'string',
              nullable: true,
            },

            addressLine1: {
              type: 'string',
              nullable: true,
            },

            addressLine2: {
              type: 'string',
              nullable: true,
            },

            city: {
              type: 'string',
              nullable: true,
            },

            state: {
              type: 'string',
              nullable: true,
            },

            country: {
              type: 'string',
              example: 'Nigeria',
            },

            logoUrl: {
              type: 'string',
              nullable: true,
            },

            verificationStatus: {
              type: 'string',
              enum: ['pending', 'verified', 'rejected'],
            },
          },
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
