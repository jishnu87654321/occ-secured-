import type { NextFunction, Request, Response } from "express";
import type { AnyZodObject } from "zod";

export function validate<T extends AnyZodObject>(schema: T, target: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(result.error);
    }
    (req as any)[target] = result.data;
    next();
  };
}
