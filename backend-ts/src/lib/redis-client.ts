/**
 * Shared Redis client for application-level operations (dedup, distributed locks, etc.)
 * Re-exports the BullMQ connection so we don't open a second TCP connection to Redis.
 */
export { connection as redisClient, isRedisAvailable } from "./queue.js";
