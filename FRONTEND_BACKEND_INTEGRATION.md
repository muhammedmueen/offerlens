# Frontend-Backend Integration Guide

Complete guide for integrating the OfferLens React frontend with the Express.js backend API.

## Table of Contents

- [Overview](#overview)
- [API Client Setup](#api-client-setup)
- [Environment Configuration](#environment-configuration)
- [CORS Configuration](#cors-configuration)
- [Authentication Flow](#authentication-flow)
- [File Upload Integration](#file-upload-integration)
- [Error Handling](#error-handling)
- [Testing Integration](#testing-integration)
- [Common Issues](#common-issues)

## Overview

The OfferLens application uses a client-server architecture:

- **Frontend:** React 18 + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Communication:** RESTful API over HTTP/HTTPS
- **Data Format:** JSON (except file uploads which use FormData)

```
┌─────────────────┐         HTTP/HTTPS          ┌─────────────────┐
│                 │    ──────────────────────>   │                 │
│  React Frontend │                              │  Express Backend│
│  (Port 5173)    │    <──────────────────────   │  (Port 3001)    │
│                 │         JSON/FormData        │                 │
└─────────────────┘                              └─────────────────┘
```

## API Client Setup

### Location

The API client is located at `offerlens-frontend/src/lib/api.ts`

### Configuration

The API client uses Axios with the following configuration:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Request Interceptor

Automatically adds authentication tokens (if needed):

```typescript
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

### Response Interceptor

Handles errors globally:

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      if (status === 429) {
        // Rate limit exceeded
        console.error('Rate limit exceeded. Please try again later.');
      } else if (status === 503) {
        // Service unavailable
        console.error('Service temporarily unavailable.');
      }
    } else if (error.request) {
      // Request made but no response
      console.error('Network error. Please check your connection.');
    }
    
    return Promise.reject(error);
  }
);
```

### API Methods

The client exports methods for each endpoint:

```typescript
// Analysis
export const analyzeOffer = async (data: AnalysisRequest) => {
  const response = await api.post('/analyze', data);
  return response.data;
};

// OCR/Text Extraction
export const extractText = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/extract-text', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Feature Requests
export const submitFeatureRequest = async (data: FeatureRequestData) => {
  const response = await api.post('/feature-requests', data);
  return response.data;
};

export const getFeatureRequests = async (filters?: FeatureRequestFilters) => {
  const response = await api.get('/feature-requests', { params: filters });
  return response.data;
};

export const voteFeatureRequest = async (id: string) => {
  const response = await api.post(`/feature-requests/${id}/vote`);
  return response.data;
};

// Metadata
export const getRoles = async () => {
  const response = await api.get('/roles');
  return response.data;
};

export const getCities = async () => {
  const response = await api.get('/cities');
  return response.data;
};

export const getExperienceLevels = async () => {
  const response = await api.get('/experience-levels');
  return response.data;
};
```

## Environment Configuration

### Development Environment

**Frontend `.env`:**
```env
VITE_API_URL=http://localhost:3001/api/v1
VITE_ENABLE_FORUM=true
```

**Backend `.env`:**
```env
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### Staging Environment

**Frontend (Vercel):**
```env
VITE_API_URL=https://offerlens-backend-staging.railway.app/api/v1
VITE_ENABLE_FORUM=true
```

**Backend (Railway):**
```env
NODE_ENV=staging
CORS_ORIGIN=https://offerlens-staging.vercel.app
```

### Production Environment

**Frontend (Vercel):**
```env
VITE_API_URL=https://api.offerlens.com/api/v1
VITE_ENABLE_FORUM=true
```

**Backend (Railway):**
```env
NODE_ENV=production
CORS_ORIGIN=https://offerlens.com,https://www.offerlens.com
```

**Note:** Multiple origins can be comma-separated.

### Accessing Environment Variables

**Frontend (Vite):**
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const enableForum = import.meta.env.VITE_ENABLE_FORUM === 'true';
```

**Backend (Node.js):**
```typescript
const corsOrigin = process.env.CORS_ORIGIN;
const port = process.env.PORT || 3001;
```

## CORS Configuration

### Backend CORS Setup

Located in `offerlens-backend/src/app.ts`:

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
```

### Testing CORS Locally

1. **Start backend:**
   ```bash
   cd offerlens-backend
   npm run dev
   ```

2. **Start frontend:**
   ```bash
   cd offerlens-frontend
   npm run dev
   ```

3. **Test in browser:**
   - Open `http://localhost:5173`
   - Open DevTools Console (F12)
   - Make an API call
   - Should see no CORS errors

### Common CORS Issues

#### Issue 1: CORS Error in Browser

**Error:**
```
Access to XMLHttpRequest at 'http://localhost:3001/api/v1/analyze' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solution:**

1. Check backend `.env`:
   ```env
   CORS_ORIGIN=http://localhost:5173
   ```

2. Restart backend server

3. Clear browser cache

#### Issue 2: Preflight Request Failed

**Error:**
```
Response to preflight request doesn't pass access control check
```

**Solution:**

Ensure backend allows OPTIONS method:
```typescript
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
```

#### Issue 3: Credentials Not Included

**Error:**
```
The value of the 'Access-Control-Allow-Credentials' header is '' 
which must be 'true'
```

**Solution:**

1. Backend: Set `credentials: true` in CORS options
2. Frontend: Include credentials in requests:
   ```typescript
   axios.create({
     withCredentials: true,
   });
   ```

### CORS Troubleshooting Checklist

- [ ] Backend `CORS_ORIGIN` matches frontend URL exactly
- [ ] No trailing slashes in URLs
- [ ] Backend server restarted after `.env` changes
- [ ] Browser cache cleared
- [ ] No browser extensions blocking requests
- [ ] Check browser console for specific error messages

## Authentication Flow

### Admin Authentication

The application uses JWT tokens for admin operations.

#### Login Flow

1. **Frontend sends credentials:**
   ```typescript
   const login = async (username: string, password: string) => {
     const response = await api.post('/admin/login', {
       username,
       password,
     });
     
     const { token } = response.data;
     localStorage.setItem('auth_token', token);
     
     return token;
   };
   ```

2. **Backend validates and returns JWT:**
   ```typescript
   // Backend: src/controllers/admin.controller.ts
   const token = jwt.sign(
     { userId: admin.id, role: admin.role },
     process.env.JWT_SECRET!,
     { expiresIn: '7d' }
   );
   
   res.json({ token });
   ```

3. **Frontend includes token in subsequent requests:**
   ```typescript
   // Automatically added by request interceptor
   config.headers.Authorization = `Bearer ${token}`;
   ```

4. **Backend verifies token:**
   ```typescript
   // Backend: src/middleware/auth.ts
   const token = req.headers.authorization?.split(' ')[1];
   const decoded = jwt.verify(token, process.env.JWT_SECRET!);
   req.user = decoded;
   next();
   ```

#### Logout Flow

```typescript
const logout = () => {
  localStorage.removeItem('auth_token');
  // Redirect to login page
};
```

#### Protected Routes

**Frontend:**
```typescript
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    return <Navigate to="/admin/login" />;
  }
  
  return children;
};

// Usage
<Route path="/admin/dashboard" element={
  <ProtectedRoute>
    <AdminDashboard />
  </ProtectedRoute>
} />
```

**Backend:**
```typescript
// Protected endpoint
router.post('/admin/salary-benchmarks', 
  authenticateAdmin,  // Middleware
  createSalaryBenchmark
);
```

### Token Expiration Handling

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);
```

## File Upload Integration

### Frontend Implementation

Located in `offerlens-frontend/src/components/FileUpload.tsx`:

```typescript
const handleFileUpload = async (file: File) => {
  try {
    setUploading(true);
    setError(null);
    
    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }
    
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Please upload PDF, JPG, PNG, or TXT');
    }
    
    // Upload file
    const result = await extractText(file);
    
    // Handle result
    if (result.success) {
      setExtractedText(result.text);
      setConfidence(result.confidence);
    } else {
      setError(result.error || 'Failed to extract text');
    }
  } catch (err) {
    setError(err.message);
  } finally {
    setUploading(false);
  }
};
```

### API Client Method

```typescript
export const extractText = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/extract-text', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000, // 60 seconds for large files
  });
  
  return response.data;
};
```

### Backend Handler

Located in `offerlens-backend/src/controllers/ocr.controller.ts`:

```typescript
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

export const extractTextHandler = [
  upload.single('file'),
  async (req, res) => {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No file uploaded' }
      });
    }
    
    // Process file based on type
    let result;
    if (file.mimetype === 'application/pdf') {
      result = await ocrService.extractFromPDF(file.buffer);
    } else if (file.mimetype.startsWith('image/')) {
      result = await ocrService.extractFromImage(file.buffer);
    } else {
      result = { text: file.buffer.toString('utf-8'), confidence: 1 };
    }
    
    res.json(result);
  }
];
```

### Progress Tracking

For large file uploads, show progress:

```typescript
const uploadWithProgress = async (file: File, onProgress: (percent: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/extract-text', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percent = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      onProgress(percent);
    },
  });
  
  return response.data;
};
```

## Error Handling

### Error Response Format

All backend errors follow this structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
}
```

### Frontend Error Handling

#### Global Error Handler

```typescript
// src/lib/api.ts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          // Validation error
          toast.error(data.error.message || 'Invalid request');
          break;
        case 401:
          // Unauthorized
          localStorage.removeItem('auth_token');
          window.location.href = '/admin/login';
          break;
        case 429:
          // Rate limit
          toast.error('Too many requests. Please try again later.');
          break;
        case 503:
          // Service unavailable
          window.location.href = '/maintenance';
          break;
        default:
          toast.error('An error occurred. Please try again.');
      }
    } else if (error.request) {
      // Network error
      toast.error('Network error. Please check your connection.');
    }
    
    return Promise.reject(error);
  }
);
```

#### Component-Level Error Handling

```typescript
const AnalysisComponent = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleAnalyze = async (data: AnalysisRequest) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await analyzeOffer(data);
      // Handle success
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {/* Rest of component */}
    </div>
  );
};
```

### Retry Logic

Implement exponential backoff for transient failures:

```typescript
const retryRequest = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Only retry on network errors or 5xx status codes
      if (
        !error.response ||
        (error.response.status >= 500 && error.response.status < 600)
      ) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
};

// Usage
const result = await retryRequest(() => analyzeOffer(data));
```

### Maintenance Mode

Show maintenance page when backend is unavailable:

```typescript
// src/components/MaintenancePage.tsx
const MaintenancePage = () => {
  return (
    <div className="maintenance-page">
      <h1>We'll be back soon!</h1>
      <p>
        We're performing scheduled maintenance. 
        Please check back in a few minutes.
      </p>
    </div>
  );
};

// In App.tsx
const App = () => {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  useEffect(() => {
    // Check backend health
    const checkHealth = async () => {
      try {
        await api.get('/health');
        setIsMaintenanceMode(false);
      } catch (error) {
        if (error.response?.status === 503) {
          setIsMaintenanceMode(true);
        }
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    
    return () => clearInterval(interval);
  }, []);
  
  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }
  
  return <Routes>{/* Normal routes */}</Routes>;
};
```

## Testing Integration

### Testing API Calls

#### Unit Tests (Frontend)

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { analyzeOffer } from './lib/api';

jest.mock('./lib/api');

test('displays analysis results', async () => {
  const mockResult = {
    redFlags: [],
    salaryComparison: { comparison: 'aligned' },
    negotiationSuggestions: [],
  };
  
  (analyzeOffer as jest.Mock).mockResolvedValue(mockResult);
  
  render(<AnalysisComponent />);
  
  // Trigger analysis
  // ...
  
  await waitFor(() => {
    expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
  });
});
```

#### Integration Tests (Backend)

```typescript
import request from 'supertest';
import app from '../app';

describe('POST /api/v1/analyze', () => {
  it('returns analysis results', async () => {
    const response = await request(app)
      .post('/api/v1/analyze')
      .send({
        offerText: 'Sample offer letter',
        role: 'Software Engineer',
        experience: '3-5 years',
        ctc: 25,
        city: 'Bangalore',
      })
      .expect(200);
    
    expect(response.body).toHaveProperty('redFlags');
    expect(response.body).toHaveProperty('salaryComparison');
  });
});
```

### Testing with Local Backend

1. **Start backend:**
   ```bash
   cd offerlens-backend
   npm run dev
   ```

2. **Run frontend tests:**
   ```bash
   cd offerlens-frontend
   npm test
   ```

### Testing with Railway Backend

Update frontend `.env.test`:
```env
VITE_API_URL=https://offerlens-backend-staging.railway.app/api/v1
```

### Manual Testing Checklist

- [ ] Upload offer letter (PDF)
- [ ] Upload offer letter (image)
- [ ] Analyze offer with valid data
- [ ] Submit feature request
- [ ] Vote on feature request
- [ ] View feedback forum
- [ ] Test error scenarios (invalid data, network error)
- [ ] Test rate limiting (make many requests quickly)
- [ ] Test CORS (from different origin)
- [ ] Test authentication (admin login)

## Common Issues

### Issue 1: API Calls Failing

**Symptoms:**
- Network errors in console
- "Failed to fetch" errors
- CORS errors

**Debugging Steps:**

1. Check backend is running:
   ```bash
   curl http://localhost:3001/api/v1/health
   ```

2. Check frontend API URL:
   ```typescript
   console.log(import.meta.env.VITE_API_URL);
   ```

3. Check browser console for errors

4. Check backend logs:
   ```bash
   tail -f offerlens-backend/logs/combined.log
   ```

### Issue 2: File Upload Not Working

**Symptoms:**
- Upload button does nothing
- "File too large" errors
- "Invalid file type" errors

**Solutions:**

1. Check file size (max 10MB)
2. Check file type (PDF, JPG, PNG, TXT only)
3. Check backend multer configuration
4. Check network tab for request details

### Issue 3: Authentication Not Working

**Symptoms:**
- 401 Unauthorized errors
- Redirected to login repeatedly
- Token not being sent

**Solutions:**

1. Check token in localStorage:
   ```javascript
   console.log(localStorage.getItem('auth_token'));
   ```

2. Check request headers in Network tab

3. Verify JWT_SECRET matches between environments

4. Check token expiration

### Issue 4: Data Not Updating

**Symptoms:**
- Stale data displayed
- Changes not reflected
- Cache issues

**Solutions:**

1. Clear browser cache
2. Check if backend cache needs invalidation
3. Force refresh (Ctrl+Shift+R)
4. Check if API call is actually being made

### Issue 5: WebSocket/Real-time Features Not Working

**Note:** Currently, the application doesn't use WebSockets, but if added:

**Solutions:**

1. Check WebSocket URL configuration
2. Verify CORS allows WebSocket connections
3. Check firewall/proxy settings
4. Use Socket.IO for better compatibility

## Best Practices

### 1. Environment Variables

- Never commit `.env` files
- Use `.env.example` as template
- Validate required variables on startup
- Use different values per environment

### 2. Error Handling

- Always handle errors in components
- Show user-friendly error messages
- Log errors for debugging
- Implement retry logic for transient failures

### 3. Loading States

- Show loading indicators during API calls
- Disable buttons while loading
- Provide feedback for long operations

### 4. Type Safety

- Use TypeScript interfaces for API responses
- Validate data with Zod on both ends
- Keep types in sync between frontend and backend

### 5. Security

- Never expose sensitive data in frontend
- Validate all inputs on backend
- Use HTTPS in production
- Implement rate limiting
- Sanitize user inputs

## Next Steps

- **API Documentation:** See `API_DOCUMENTATION.md`
- **Deployment Guide:** See `DEPLOYMENT.md`
- **Error Handling:** See `offerlens-backend/ERROR_HANDLING.md`
- **Testing Guide:** See `TESTING.md`

## Getting Help

If you encounter integration issues:

1. Check this guide first
2. Review backend logs
3. Check browser console
4. Search GitHub issues
5. Create a new issue with details

Happy integrating! 🔗
