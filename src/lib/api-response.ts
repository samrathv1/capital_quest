import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors/app-error';
import { ZodError } from 'zod';

export function successResponse<T>(data: T, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status, headers }
  );
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: error.flatten(),
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 422 }
    );
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 500 }
  );
}
