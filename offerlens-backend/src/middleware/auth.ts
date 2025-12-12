import { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/admin.service';
import logger from '../utils/logger';

// Extend Express Request to include admin
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}

/**
 * Middleware to verify JWT token and authenticate admin users
 * Requirements: 5.2
 */
export const authenticateAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = adminService.verifyToken(token);
    
    // Attach admin info to request
    req.admin = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };

    logger.debug(`Admin authenticated: ${payload.username}`);
    next();
  } catch (error) {
    logger.warn('Admin authentication failed', { error });
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
};

/**
 * Middleware to check if admin has super_admin role
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.admin) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
    return;
  }

  if (req.admin.role !== 'super_admin') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Super admin access required',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
    return;
  }

  next();
};
