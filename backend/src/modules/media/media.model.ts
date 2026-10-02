import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Uploaded catalog images (product and category photos). Stored in MongoDB so every API instance can
 * serve them without shared disk; the admin app resizes and compresses before uploading.
 */
const mediaSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    uploadedBy: { id: Schema.Types.ObjectId, name: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

mediaSchema.index({ organizationId: 1, createdAt: -1 });

export type MediaDoc = InferSchemaType<typeof mediaSchema>;
export const Media = model('Media', mediaSchema, 'media');
