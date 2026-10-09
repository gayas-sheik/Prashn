export function log(event: string, fields: Record<string, string | number | boolean | undefined> = {}): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}
export function logError(event: string, error: any, fields: Record<string, string | number | boolean | undefined> = {}): void {
  // Never include request bodies, extracted contents, tokens or SDK request objects.
  log(event, { ...fields, errorType: error?.name || 'Error' });
}
