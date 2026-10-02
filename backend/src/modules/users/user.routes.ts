import { Router } from 'express';
import type { UserDto } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { User } from './user.model';

export const userRouter = Router();

userRouter.get('/', requirePermission('users:read'), async (req, res) => {
  const users = await User.find({ organizationId: req.tenantId }).sort({ createdAt: 1 }).limit(500).lean();
  const data: UserDto[] = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));
  res.json({ data });
});
