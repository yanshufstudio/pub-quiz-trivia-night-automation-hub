import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { apiKey, paddleEnv } from "./config";

const globalForPaddle = globalThis as unknown as { paddle: Paddle | undefined };

/** One SDK instance per process. Reads PADDLE_API_KEY lazily so importing
 * this module in a test or a build never throws. */
export function getPaddle(): Paddle {
  if (globalForPaddle.paddle) return globalForPaddle.paddle;
  const paddle = new Paddle(apiKey(), {
    environment: paddleEnv() === "production" ? Environment.production : Environment.sandbox,
    logLevel: LogLevel.error,
  });
  globalForPaddle.paddle = paddle;
  return paddle;
}
