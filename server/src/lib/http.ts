import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod';

/** Enveloppe un handler async : les rejets partent vers le middleware d'erreur. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Introuvable') => new HttpError(404, msg);

/** Valide le corps de la requête ; renvoie 400 avec un message lisible en français. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): TypeOf<S> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      throw badRequest(`${first.path.join('.') || 'champ'} : ${first.message}`);
    }
    throw err;
  }
}
