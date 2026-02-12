export interface StorageProvider {
    upload(file: Buffer, filename: string): Promise<string>;
    delete(path: string): Promise<void>;
    getUrl(path: string): string;
}
