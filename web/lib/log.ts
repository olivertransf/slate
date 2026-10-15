type Field = string | number | boolean | null;

export function logEvent(event: string, fields: Record<string, Field> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
