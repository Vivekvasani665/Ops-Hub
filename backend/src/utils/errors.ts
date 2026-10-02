export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  validation: (details: unknown) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  unauthenticated: (msg = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', msg),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Access token expired'),
  forbidden: (msg = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`),
  conflict: (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details),
  locked: (msg: string) => new AppError(423, 'ACCOUNT_LOCKED', msg),
};
