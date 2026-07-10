type LogMeta = Record<string, unknown>;

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    console.log(`[indexer] ${message}${formatMeta(meta)}`);
  },
  warn(message: string, meta?: LogMeta): void {
    console.warn(`[indexer] ${message}${formatMeta(meta)}`);
  },
  error(message: string, meta?: LogMeta): void {
    console.error(`[indexer] ${message}${formatMeta(meta)}`);
  },
};
