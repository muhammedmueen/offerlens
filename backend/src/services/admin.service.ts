import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import config from '../config';
import logger from '../utils/logger';

export interface AdminLoginDTO {
  username: string;
  password: string;
}

export interface AdminTokenPayload {
  id: string;
  username: string;
  role: string;
}

export class AdminService {
  /**
   * Authenticate admin user and generate JWT token
   * Requirements: 5.2
   */
  async authenticate(username: string, password: string): Promise<string> {
    // Find admin user
    const admin = await prisma.adminUser.findUnique({
      where: { username },
    });

    if (!admin) {
      logger.warn(`Failed login attempt for username: ${username}`);
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
    if (!isValidPassword) {
      logger.warn(`Failed login attempt for username: ${username}`);
      throw new Error('Invalid credentials');
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const payload: AdminTokenPayload = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };

    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: '7d' });

    logger.info(`Admin user logged in: ${username}`);
    return token;
  }

  /**
   * Verify JWT token and return admin payload
   */
  verifyToken(token: string): AdminTokenPayload {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as AdminTokenPayload;
      return payload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Create a new admin user (for seeding/setup)
   */
  async createAdmin(username: string, password: string, role: string = 'admin'): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        role,
      },
    });

    logger.info(`Admin user created: ${username}`);
  }
}

export const adminService = new AdminService();
