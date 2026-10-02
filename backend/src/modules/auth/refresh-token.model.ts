import { Schema, model } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    /** sha256 of the opaque token; the raw token only ever lives in the httpOnly cookie */
    tokenHash: { type: String, required: true },
    /** every rotation chain shares a family; reuse of a revoked token revokes the whole family */
    familyId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

export const RefreshToken = model('RefreshToken', refreshTokenSchema, 'refresh_tokens');
