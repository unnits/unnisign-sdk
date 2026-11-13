export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SigningDocument {
  /** UUID of an existing document configured in the client's workspace. */
  uuid: string;
  file: Blob;
  filename: string;
  pdfTitle?: string;
}

export interface CreateSigningProcedure {
  documents: readonly SigningDocument[];
  singleDeviceSign: boolean;
  webhookUrl: string;
  headless?: boolean;
  redirectUrl?: string;
  clientMetadata?: Record<string, JsonValue> | JsonValue[];
  clientHeaders?: Record<string, JsonValue> | JsonValue[];
  settings?: readonly { name: string; value: string }[];
  presetId?: number;
}

export interface SigningLink {
  value: string;
  expires_at: string;
  signer?: string;
}

/** Response fields retain their API names. */
export interface SigningProcedure {
  uuid: string;
  redirect_url: string | null;
  signing_links: SigningLink[];
}

export interface UnniSignOptions {
  /** Deployment root, e.g. https://sign.unni.cloud (not /api/v1). */
  baseUrl: string;
  accessToken: string;
  /** Total request timeout, including the response body. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Optional replacement for native fetch, for testing or custom networking. */
  fetch?: typeof globalThis.fetch;
}
