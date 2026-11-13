export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`UnniSign API request failed (HTTP ${statusCode}).`);
    this.name = "ApiError";
  }
}

export class UnexpectedResponseError extends Error {
  constructor() {
    super("UnniSign returned an invalid signing procedure response.");
    this.name = "UnexpectedResponseError";
  }
}
