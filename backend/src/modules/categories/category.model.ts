import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

/**
 * Admin-managed catalog categories. Products keep their category as a plain string (unchanged), and this
 * collection adds what a string cannot hold: empty categories, an image, and a single place to rename.
 * Names match products case-insensitively through `nameLower`.
 */
const categorySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true },
    imageUrl: { type: String, trim: true, default: null },
  },
  { timestamps: true },
);

categorySchema.index({ organizationId: 1, nameLower: 1 }, { unique: true });

categorySchema.pre('validate', function () {
  if (this.name) this.nameLower = this.name.toLowerCase();
});

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const Category = model('Category', categorySchema, 'categories');

/**
 * Makes sure each named category has a row; existing rows (and their spelling) are left alone.
 * Runs outside business transactions: two requests racing to insert the same name is harmless (E11000 is ignored).
 */
export async function ensureCategories(organizationId: Types.ObjectId, names: string[]) {
  const unique = new Map(names.filter(Boolean).map((n) => [n.trim().toLowerCase(), n.trim()]));
  if (unique.size === 0) return;
  try {
    await Category.bulkWrite(
    [...unique].map(([nameLower, name]) => ({
      updateOne: {
        filter: { organizationId, nameLower },
        update: { $setOnInsert: { organizationId, nameLower, name, imageUrl: null } },
        upsert: true,
      },
    })),
      { ordered: false },
    );
  } catch (err) {
    const writeErrors = (err as { writeErrors?: { code?: number; err?: { code?: number } }[] }).writeErrors;
    const onlyDuplicates = writeErrors?.length && writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    if (!onlyDuplicates && (err as { code?: number }).code !== 11000) throw err;
  }
}
