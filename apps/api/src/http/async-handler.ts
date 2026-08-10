import type { NextFunction, Request, Response } from 'express';

/**
 * Wrap an async Express handler so a rejected promise is forwarded to the error
 * middleware (Express doesn't catch async throws on its own). Every route uses this so
 * a thrown AppError becomes the safe ErrorResponse envelope.
 */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function ah(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
