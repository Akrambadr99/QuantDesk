/** Minimal persistence capabilities, independent of workspace and domain models. */
export interface StorageReader {
  getItem: (key: string) => string | null
}

export interface StorageWriter {
  setItem: (key: string, value: string) => void
}

export interface StoragePort extends StorageReader, StorageWriter {}
