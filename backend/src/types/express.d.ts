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
      /** Storefront requests: the store (organization) being shopped. */
      store?: { id: Types.ObjectId; name: string; currency: string };
      /** Storefront requests: the signed-in shopper. */
      customer?: { id: Types.ObjectId; name: string; email: string };
    }
  }
}

export {};
