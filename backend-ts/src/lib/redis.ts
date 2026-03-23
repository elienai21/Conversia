import IORedis from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

export const redis = new IORedis.default(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times: number) {
    if (times > 3) {
      logger.warn("[Redis] Max retries reached — running without Redis");
      return null;
    }
    return Math.min(times * 500, 2000);
  },
});
