import type { Types } from 'mongoose';
import type { Role } from '@shared';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: Types.ObjectId;
        organizationId: Types.ObjectId;
        role: Role;
        name: string;
      };
      /** The tenant every query in this request must be scoped to. */
      tenantId?: Types.ObjectId;
    }
  }
}

export {};
