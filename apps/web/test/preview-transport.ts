// Test-only preview boundary. Production app routes never import this file.
export interface PreviewTransport<T> {
  readonly previewOnly: true;
  readonly previewLabel: string;
  load(): Promise<T>;
}
