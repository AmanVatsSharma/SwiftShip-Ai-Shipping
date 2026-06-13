// shim for `@prisma/client/runtime/library` — kept tiny because no service
// actually consumes PrismaClientKnownRequestError at runtime; we already
// migrated those error checks to QueryFailedError.
export declare class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, any>;
  constructor(message: string, opts: { code: string; meta?: any; clientVersion?: string });
}

export declare class PrismaClientValidationError extends Error {}
export declare class PrismaClientInitializationError extends Error {}
