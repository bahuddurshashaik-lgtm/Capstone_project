export const STORE_CORRUPT = 'STORE_CORRUPT';
export const STORE_WRITE_FAILED = 'STORE_WRITE_FAILED';

const STORE_ERROR_CODES = [STORE_CORRUPT, STORE_WRITE_FAILED];

export class ValidationError extends Error {
  constructor(fields, message = 'Please correct the highlighted fields.') {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.fields = { ...fields };
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
  }
}

export class StoreError extends Error {
  constructor(code, message, options = {}) {
    if (!STORE_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown store error code: ${code}`);
    }
    super(message, options);
    this.name = 'StoreError';
    this.code = code;
  }
}
