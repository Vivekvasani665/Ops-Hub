import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiError as ApiErrorBody } from '@/shared';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number | undefined,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as Partial<ApiErrorBody> | undefined;
    if (body?.error) {
      return new ApiError(body.error.code, body.error.message, err.response?.status, body.error.details);
    }
    if (!err.response) return new ApiError('NETWORK_ERROR', 'Unable to reach the server', undefined);
    return new ApiError('HTTP_ERROR', err.message, err.response.status);
  }
  return new ApiError('UNKNOWN', err instanceof Error ? err.message : 'Something went wrong', undefined);
}

export function errorMessage(err: unknown): string {
  return toApiError(err).message;
}

// ---- Single-flight refresh on TOKEN_EXPIRED -------------------------------
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshPromise ??= api
    .post('/auth/refresh', undefined, { _skipRefresh: true } as AxiosRequestConfig)
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean; _skipRefresh?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const code = error.response?.data?.error?.code;
    if (
      config &&
      error.response?.status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      !config._retried &&
      !config._skipRefresh
    ) {
      config._retried = true;
      try {
        await refreshSession();
      } catch (refreshErr) {
        return Promise.reject(toApiError(refreshErr));
      }
      return api.request(config);
    }
    return Promise.reject(toApiError(error));
  },
);
