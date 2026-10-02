import { Router } from 'express';
import { loginSchema } from '@shared';
import { validateBody } from '../../middlewares/validation.middleware';
import { loginRateLimit } from '../../middlewares/rate-limit.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { loginController, logoutController, meController, refreshController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, validateBody(loginSchema), loginController);
authRouter.post('/refresh', loginRateLimit, refreshController);
authRouter.post('/logout', logoutController);
authRouter.get('/me', authenticate, meController);
