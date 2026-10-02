import express, { Router } from 'express';
import type { MediaUploadDto } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { Errors, AppError } from '../../utils/errors';
import { parseObjectId } from '../../utils/http';
import { Media } from './media.model';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MEDIA_URL_PREFIX = '/api/storefront/media/';

/** Trust the bytes, not the Content-Type header. */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

/** The media id when `url` points at one of our uploads, else null. */
export function mediaIdFromUrl(url: string | null | undefined): string | null {
  return url?.startsWith(MEDIA_URL_PREFIX) ? url.slice(MEDIA_URL_PREFIX.length) : null;
}

/** Staff upload: `POST /api/media` with the raw image as the body. */
export const mediaRouter = Router();

mediaRouter.post(
  '/',
  requirePermission('products:write'),
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw Errors.validation({ file: 'Send the image as the request body' });
    const contentType = sniffImageType(body);
    if (!contentType) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPG, PNG, WebP or GIF image');
    const media = await Media.create({
      organizationId: req.tenantId,
      contentType,
      size: body.length,
      data: body,
      uploadedBy: { id: req.auth!.userId, name: req.auth!.name },
    });
    const data: MediaUploadDto = { id: String(media._id), url: `${MEDIA_URL_PREFIX}${String(media._id)}` };
    res.status(201).json({ data });
  },
);

/**
 * Public read, mounted under /api/storefront so the customer web's existing proxy serves catalog images too.
 * Ids are immutable (a new upload gets a new id), so responses cache forever.
 */
export const mediaPublicRouter = Router();

mediaPublicRouter.get('/:id', async (req, res) => {
  const id = parseObjectId(String(req.params.id), 'Image');
  // Not lean: a lean read returns a BSON Binary, a hydrated doc gives a Buffer.
  const media = await Media.findById(id);
  if (!media) throw Errors.notFound('Image');
  res.set({
    'Content-Type': media.contentType,
    'Content-Length': String(media.size),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(media.data);
});
