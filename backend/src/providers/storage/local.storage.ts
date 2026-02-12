import { StorageProvider } from './storage.provider.js';
import fs from 'fs/promises';
import path from 'path';
import { config } from '@/config/index.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export class LocalStorageProvider implements StorageProvider {
    private uploadDir: string;

    constructor() {
        this.uploadDir = path.resolve(config.STORAGE_PATH);
        // Ensure upload directory exists
        fs.mkdir(this.uploadDir, { recursive: true }).catch((err) => {
            console.error('Failed to create upload directory:', err);
        });
    }

    async upload(file: Buffer, filename: string): Promise<string> {
        try {
            const uniqueName = `${Date.now()}-${filename}`;
            const filePath = path.join(this.uploadDir, uniqueName);

            await fs.writeFile(filePath, file);

            return filePath;
        } catch (error) {
            throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'File upload failed', 500, error);
        }
    }

    async delete(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'File deletion failed', 500, error);
            }
        }
    }

    getUrl(filePath: string): string {
        // For local storage, we don't serve public URLs directly in Phase 1
        // But we return the absolute path for internal processing
        return filePath;
    }
}
