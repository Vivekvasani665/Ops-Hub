import type { ClientSession, Types } from 'mongoose';
import type { InventoryItemDto, StockStatus } from '@shared';
import { Errors } from '../../utils/errors';
import { Inventory } from './inventory.model';

export interface StockLine {
  productId: Types.ObjectId;
  quantity: number;
  sku?: string;
}

export function stockStatus(available: number, reorderLevel: number): StockStatus {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * Reserve stock for every line, atomically per row:
 *
 *   updateOne({ productId, available: { $gte: qty } }, { $inc: { available: -qty, reserved: +qty } })
 *
 * The check and the decrement are ONE server-side operation on one document, so two
 * requests can never both pass a stale "available >= qty" check (no read-modify-write race).
 * Lines are processed in a deterministic order and the caller runs this inside a transaction,
 * so a multi-item order either reserves everything or nothing.
 */
export async function reserveStock(organizationId: Types.ObjectId, lines: StockLine[], session: ClientSession) {
  const sorted = [...lines].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
  const results: { productId: Types.ObjectId; available: number; reserved: number; reorderLevel: number }[] = [];

  for (const line of sorted) {
    const updated = await Inventory.findOneAndUpdate(
      { organizationId, productId: line.productId, available: { $gte: line.quantity } },
      { $inc: { available: -line.quantity, reserved: line.quantity } },
      { session, new: true, lean: true },
    );
    if (!updated) {
      const current = await Inventory.findOne({ organizationId, productId: line.productId }, null, { session }).lean();
      throw Errors.conflict('INSUFFICIENT_STOCK', `Insufficient stock for ${line.sku ?? 'product'}`, {
        productId: String(line.productId),
        sku: line.sku,
        requested: line.quantity,
        available: current?.available ?? 0,
      });
    }
    results.push({
      productId: line.productId,
      available: updated.available,
      reserved: updated.reserved,
      reorderLevel: updated.reorderLevel,
    });
  }
  return results;
}

/** Cancelled order: reserved units go back to available. */
export async function releaseStock(organizationId: Types.ObjectId, lines: StockLine[], session: ClientSession) {
  const results = [];
  for (const line of lines) {
    const updated = await Inventory.findOneAndUpdate(
      { organizationId, productId: line.productId, reserved: { $gte: line.quantity } },
      { $inc: { available: line.quantity, reserved: -line.quantity } },
      { session, new: true, lean: true },
    );
    if (!updated) throw Errors.conflict('INVENTORY_INCONSISTENT', 'Reserved stock is lower than expected');
    results.push({ productId: line.productId, available: updated.available, reserved: updated.reserved });
  }
  return results;
}

/** Shipped order: reserved units physically leave the warehouse. */
export async function consumeReservedStock(organizationId: Types.ObjectId, lines: StockLine[], session: ClientSession) {
  const results = [];
  for (const line of lines) {
    const updated = await Inventory.findOneAndUpdate(
      { organizationId, productId: line.productId, reserved: { $gte: line.quantity } },
      { $inc: { reserved: -line.quantity } },
      { session, new: true, lean: true },
    );
    if (!updated) throw Errors.conflict('INVENTORY_INCONSISTENT', 'Reserved stock is lower than expected');
    results.push({ productId: line.productId, available: updated.available, reserved: updated.reserved });
  }
  return results;
}

/** Manual stock adjustment; a negative delta can never push `available` below zero. */
export async function adjustStock(
  organizationId: Types.ObjectId,
  productId: Types.ObjectId,
  delta: number,
  session?: ClientSession,
) {
  const filter: Record<string, unknown> = { organizationId, productId };
  if (delta < 0) filter.available = { $gte: -delta };
  const updated = await Inventory.findOneAndUpdate(filter, { $inc: { available: delta } }, { session, new: true });
  if (!updated) {
    const exists = await Inventory.exists({ organizationId, productId });
    if (!exists) throw Errors.notFound('Inventory item');
    throw Errors.conflict('INSUFFICIENT_STOCK', 'Adjustment would make available stock negative');
  }
  return updated;
}

export function toInventoryDto(
  inv: { _id: unknown; available: number; reserved: number; reorderLevel: number; updatedAt: Date },
  product: { _id: unknown; name: string; sku: string; category: string; price: number },
): InventoryItemDto {
  return {
    id: String(inv._id),
    product: {
      id: String(product._id),
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
    },
    available: inv.available,
    reserved: inv.reserved,
    reorderLevel: inv.reorderLevel,
    stockStatus: stockStatus(inv.available, inv.reorderLevel),
    updatedAt: new Date(inv.updatedAt).toISOString(),
  };
}
