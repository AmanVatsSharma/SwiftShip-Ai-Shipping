import * as Joi from 'joi';

/**
 * Environment variable validation schema for the SwiftShip API.
 *
 * This is the single source of truth for what env vars the runtime needs.
 * Consumed by apps/api via ConfigModule.forRoot({ validationSchema: environmentValidationSchema }).
 */
export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default,

  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // CORS
  CORS_ORIGIN: Joi.string().optional(),

  // Shopify
  SHOPIFY_API_KEY: Joi.string().optional(),
  SHOPIFY_API_SECRET: Joi.string().optional(),
  SHOPIFY_APP_URL: Joi.string().uri().optional(),
  SHOPIFY_SCOPES: Joi.string().optional(),

  // JWT
  JWT_SECRET: Joi.string().default('dev-secret'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  // Redis (for BullMQ)
  REDIS_URL: Joi.string().uri().optional(),

  // Carriers
  DELHIVERY_TOKEN: Joi.string().optional(),
  XPRESSBEES_TOKEN: Joi.string().optional(),

  // Payments
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  RAZORPAY_KEY_ID: Joi.string().optional(),
  RAZORPAY_KEY_SECRET: Joi.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().optional(),
  PAYMENT_DEFAULT_GATEWAY: Joi.string()
    .valid('STRIPE', 'RAZORPAY')
    .optional(),

  // Email
  SENDGRID_API_KEY: Joi.string().optional(),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().email().optional(),
  EMAIL_FROM_NAME: Joi.string().optional(),

  // App
  APP_URL: Joi.string().uri().optional(),

  // GSTN
  GSTN_API_URL: Joi.string().uri().optional(),
  GSTN_API_KEY: Joi.string().optional(),
  GSTN_CLIENT_ID: Joi.string().optional(),
  GSTN_CLIENT_SECRET: Joi.string().optional(),
  GSTN_SIGNATURE_SECRET: Joi.string().optional(),
  GSTN_RETRY_ATTEMPTS: Joi.number().optional(),

  // Storage
  STORAGE_DRIVER: Joi.string().valid('s3', 'stub').optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_REGION: Joi.string().optional(),
  S3_ENDPOINT: Joi.string().optional(),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  S3_FORCE_PATH_STYLE: Joi.string().optional(),
});
