export interface ApiError { code: string; message: string; }
export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
