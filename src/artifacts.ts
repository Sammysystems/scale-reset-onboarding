import { promises as fs } from "node:fs";
import path from "node:path";
import type { RenderableDocument, StoredDocument } from "./types.js";

export interface ArtifactStore {
  save(clientName: string, documents: RenderableDocument[]): Promise<StoredDocument[]>;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "client";
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  async save(clientName: string, documents: RenderableDocument[]): Promise<StoredDocument[]> {
    const directory = path.join(this.root, slugify(clientName));
    await fs.mkdir(directory, { recursive: true });

    const stored: StoredDocument[] = [];
    for (const document of documents) {
      const file = path.join(directory, document.filename);
      await fs.writeFile(file, document.content, "utf8");
      stored.push({ kind: document.kind, path: file });
    }
    return stored;
  }
}
