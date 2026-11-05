export class RequestError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    this.headers = { ...headers };
  }
}

export const routeNotFound = () =>
  new RequestError(404, 'ROUTE_NOT_FOUND', 'The requested address does not exist.');

export const methodNotAllowed = (allowedMethods) =>
  new RequestError(405, 'METHOD_NOT_ALLOWED', 'This request method is not supported here.', {
    Allow: allowedMethods.join(', '),
  });

export const forbidden = () => new RequestError(403, 'FORBIDDEN', 'This request was blocked.');

export const payloadTooLarge = () =>
  new RequestError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');

export const unsupportedMediaType = () =>
  new RequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json.');
