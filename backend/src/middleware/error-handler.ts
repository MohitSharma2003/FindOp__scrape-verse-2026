import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found" } });
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown, _req: Request, res: Response, _next: NextFunction,
): void => {
  if (res.headersSent) return;
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    res.status(400).json({ success: false, error: { code: "INVALID_DATA", message: "Invalid request data" } });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    res.status(409).json({ success: false, error: { code: "DUPLICATE_RESOURCE", message: "Resource already exists" } });
    return;
  }
  console.error("Unhandled API error", error instanceof Error ? error.message : error);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};
