import fs from 'node:fs';
import path from 'node:path';
import express, { Router, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env';
import { authenticate } from './middlewares/auth.middleware';
import { resolveTenant } from './middlewares/tenant.middleware';
import { apiRateLimit } from './middlewares/rate-limit.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { Errors } from './utils/errors';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { orderRouter } from './modules/orders/order.routes';
import { productRouter } from './modules/products/product.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { jobRouter } from './modules/jobs/job.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { userRouter } from './modules/users/user.routes';
import { organizationRouter } from './modules/organizations/organization.routes';
import { storefrontRouter } from './modules/storefront/storefront.routes';
import { paymentWebhookRouter } from './modules/payments/payment.webhook';
import { categoryRouter } from './modules/categories/category.routes';
import { customerRouter } from './modules/customers/customer.routes';
import { couponRouter } from './modules/coupons/coupon.routes';
import { mediaPublicRouter, mediaRouter } from './modules/media/media.routes';

/**
 * CSRF defence in depth on top of SameSite cookies: a state-changing request that declares an
 * Origin must come from the web app's origin.
 */
const originGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.WEB_ORIGIN.includes(origin)) return next(Errors.forbidden('Cross-origin request blocked'));
  next();
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  // Razorpay webhooks need the raw body for signature verification, so they are mounted before express.json.
  app.use('/api/payments', paymentWebhookRouter);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use('/api', originGuard);

  app.get('/api/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ data: { status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down' } });
  });

  app.use('/api/auth', authRouter);
  // Uploaded catalog images are public and live under /api/storefront so the customer web's proxy reaches them.
  app.use('/api/storefront/media', mediaPublicRouter);
  // Customer web storefront: its own customer sessions, tenant fixed by STOREFRONT_ORG_SLUG.
  app.use('/api/storefront', storefrontRouter);

  // Everything below is authenticated and tenant-scoped. `req.tenantId` comes only from the verified token.
  const protectedApi = Router();
  protectedApi.use(authenticate, resolveTenant, apiRateLimit);
  protectedApi.use('/dashboard', dashboardRouter);
  protectedApi.use('/orders', orderRouter);
  protectedApi.use('/products', productRouter);
  protectedApi.use('/categories', categoryRouter);
  protectedApi.use('/customers', customerRouter);
  protectedApi.use('/coupons', couponRouter);
  protectedApi.use('/media', mediaRouter);
  protectedApi.use('/inventory', inventoryRouter);
  protectedApi.use('/audit-logs', auditRouter);
  protectedApi.use('/jobs', jobRouter);
  protectedApi.use('/notifications', notificationRouter);
  protectedApi.use('/users', userRouter);
  protectedApi.use('/organizations', organizationRouter);
  app.use('/api', protectedApi);
  app.use('/api', notFoundHandler);

  // Optional: serve a built frontend (frontend/dist) from the same origin, keeping cookies first-party.
  // Without WEB_DIST the frontend is deployed separately (e.g. nginx proxying /api to this server).
  const webDist = env.WEB_DIST ? path.resolve(env.WEB_DIST) : null;
  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
