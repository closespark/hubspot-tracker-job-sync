import { logger } from './logger';

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt}/${maxRetries} for ${operationName}`);
      }
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1})`, error);

      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        logger.info(`Waiting ${backoffDelay}ms before retry...`);
        await sleep(backoffDelay);
      }
    }
  }

  if (!lastError) {
    throw new Error(`Operation ${operationName} failed without error`);
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
