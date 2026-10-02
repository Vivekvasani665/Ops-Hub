import type { Types } from 'mongoose';
import { Product } from '../products/product.model';
import { Category } from '../categories/category.model';
import { Media } from './media.model';
import { mediaIdFromUrl } from './media.routes';
import { logger } from '../../utils/logger';

/** Deletes an uploaded image once no product or category of the tenant points at it any more. Best effort. */
export async function releaseMedia(organizationId: Types.ObjectId, url: string | null | undefined) {
  const id = mediaIdFromUrl(url);
  if (!id) return;
  try {
    const [usedByProduct, usedByCategory] = await Promise.all([
      Product.exists({ organizationId, imageUrl: url }),
      Category.exists({ organizationId, imageUrl: url }),
    ]);
    if (!usedByProduct && !usedByCategory) await Media.deleteOne({ _id: id, organizationId });
  } catch (err) {
    logger.error('Could not release media', err);
  }
}
