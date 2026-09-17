import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

interface SwaggerServer {
  url: string;
  description: string;
}

function buildServers(): SwaggerServer[] {
  const localUrl = `http://localhost:${env.port}/api/v1`;

  const candidates: Array<{ url?: string; description: string }> = [
    { url: env.apiUrl, description: `${env.nodeEnv} (current)` },
    { url: env.stagingApiUrl, description: 'Staging' },
    { url: env.productionApiUrl, description: 'Production' },
    { url: localUrl, description: 'Local' },
  ];

  const known: SwaggerServer[] = candidates.filter((s): s is SwaggerServer => Boolean(s.url));

  const seen = new Set<string>();
  const servers = known.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  return servers.length > 0 ? servers : [{ url: localUrl, description: 'Local' }];
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
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Something went wrong' },
            details: { type: 'object', nullable: true },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            otherName: { type: 'string', nullable: true },
            dob: { type: 'string', format: 'date', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            role: { type: 'string', enum: ['consumer', 'merchant'], nullable: true },
            businessName: { type: 'string', nullable: true },
            bvnVerified: { type: 'boolean' },
            kycTier: { type: 'integer', example: 0 },
            onboardingStage: {
              type: 'string',
              enum: ['phone_verified', 'profile_set', 'bvn_verified', 'completed'],
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },

        // Wallet: {
        //   type: 'object',
        //   properties: {
        //     id: { type: 'string', format: 'uuid' },
        //     userId: { type: 'string', format: 'uuid' },
        //     balance: { type: 'integer', description: 'Balance in kobo', example: 500000 },
        //     currency: { type: 'string', example: 'NGN' },
        //     status: { type: 'string', enum: ['active', 'suspended', 'closed'] },
        //   },
        // },
        // QrCode: {
        //   type: 'object',
        //   properties: {
        //     id: { type: 'string', format: 'uuid' },
        //     code: { type: 'string' },
        //     ownerId: { type: 'string', format: 'uuid' },
        //     type: { type: 'string', enum: ['static', 'dynamic'] },
        //     amount: { type: 'integer', nullable: true, description: 'Amount in kobo' },
        //     currency: { type: 'string', example: 'NGN' },
        //     status: { type: 'string', enum: ['active', 'used', 'expired', 'cancelled'] },
        //     narration: { type: 'string', nullable: true },
        //     expiresAt: { type: 'string', format: 'date-time', nullable: true },
        //   },
        // },
        // QrCreateResponse: {
        //   type: 'object',
        //   properties: {
        //     qr: { $ref: '#/components/schemas/QrCode' },
        //     imageDataUrl: { type: 'string', description: 'Base64 PNG data URL of the QR code' },
        //   },
        // },
        // Transaction: {
        //   type: 'object',
        //   properties: {
        //     id: { type: 'string', format: 'uuid' },
        //     reference: { type: 'string' },
        //     type: {
        //       type: 'string',
        //       enum: ['qr_payment', 'funding', 'withdrawal', 'p2p_transfer'],
        //     },
        //     amount: { type: 'integer', description: 'Amount in kobo' },
        //     currency: { type: 'string', example: 'NGN' },
        //     status: { type: 'string', enum: ['pending', 'success', 'failed', 'reversed'] },
        //     senderUserId: { type: 'string', format: 'uuid', nullable: true },
        //     receiverUserId: { type: 'string', format: 'uuid', nullable: true },
        //     narration: { type: 'string', nullable: true },
        //     createdAt: { type: 'string', format: 'date-time' },
        //   },
        // },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Every route file with `@openapi` JSDoc blocks gets picked up here.
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
