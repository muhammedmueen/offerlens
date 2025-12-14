# Error Handling Implementation

This document describes the error handling implementation for the Next.js frontend migration.

## Overview

The error handling system provides comprehensive error management across the application, including:

- Component-level error boundaries
- Route-specific error pages
- API error handling with retry logic
- Upload error handling
- Maintenance page for backend unavailability
- Centralized error logging

## Components

### 1. Error Boundary (`components/error-boundary.tsx`)

**Requirement 6.1**: Catches React component errors and displays fallback UI

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

function MyApp() {
  return (
    <ErrorBoundary>
      <YourComponent />
    </ErrorBoundary>
  )
}
```

Features:
- Catches errors in child components
- Displays user-friendly fallback UI
- Logs errors to console (development) and error tracking service (production)
- Provides reset functionality to recover from errors
- Custom fallback component support

### 2. Global Error Page (`app/error.tsx`)

**Requirement 6.1**: Next.js error.tsx for handling route segment errors

Automatically catches errors in the app router and displays a fallback UI with:
- Error message
- Stack trace (development only)
- Try Again button
- Go Home button

### 3. Route-Specific Error Pages

#### Upload Error (`app/upload/error.tsx`)

**Requirement 6.3**: Displays specific error messages for upload failures

Features:
- File-specific error detection
- Common upload issues list
- Contextual error messages

#### Results Error (`app/results/error.tsx`)

**Requirement 6.2**: Displays user-friendly error messages for API failures

Features:
- Data missing detection
- API error detection
- Helpful tips for users
- Upload redirect for missing data

### 4. Maintenance Page (`components/maintenance-page.tsx`)

**Requirement 6.4**: Displays when backend is unavailable

```tsx
import { MaintenancePage } from '@/components/maintenance-page'

<MaintenancePage
  title="We'll be back soon"
  message="Scheduled maintenance in progress"
  showRetry={true}
  onRetry={() => window.location.reload()}
/>
```

Features:
- Animated maintenance icon
- Custom title and message
- Retry functionality
- Status indicator

### 5. Error Logger (`lib/utils/error-logger.ts`)

**Requirement 6.5**: Centralized error logging for debugging

```typescript
import { logError, logAPIError, logComponentError } from '@/lib/utils/error-logger'

// Log general error
logError(error, {
  component: 'MyComponent',
  action: 'handleSubmit',
  metadata: { userId: '123' }
})

// Log API error
logAPIError(error, '/api/analyze', 'POST', 500)

// Log component error
logComponentError(error, 'UploadForm', 'handleFileUpload')
```

Features:
- Structured error logging
- Context and metadata support
- localStorage persistence (development)
- Error tracking service integration (production)
- Error type detection (network, auth, server)

### 6. Error Handler Hook (`hooks/use-error-handler.ts`)

**Requirements 6.2, 6.3, 6.5**: Provides error handling utilities for components

```typescript
import { useErrorHandler } from '@/hooks/use-error-handler'

function MyComponent() {
  const { handleError, clearError, hasError, errorMessage } = useErrorHandler({
    componentName: 'MyComponent',
    showToast: true,
  })

  const handleSubmit = async () => {
    try {
      await submitData()
    } catch (error) {
      handleError(error, 'handleSubmit')
    }
  }

  return (
    <div>
      {hasError && <ErrorMessage message={errorMessage} />}
      <button onClick={handleSubmit}>Submit</button>
    </div>
  )
}
```

Features:
- Automatic error logging
- Toast notifications
- Error state management
- Network/server error detection
- Async operation support with `useAsyncError`

### 7. Error Message Component (`components/ui/error-message.tsx`)

**Requirement 6.2**: Reusable component for displaying error messages

```tsx
import { ErrorMessage } from '@/components/ui/error-message'

<ErrorMessage
  title="Upload Failed"
  message="File size exceeds 10MB limit"
  type="error"
  showRetry={true}
  onRetry={handleRetry}
/>
```

Types:
- `error`: General errors (red)
- `network`: Network/connection errors
- `server`: Server errors
- `warning`: Warnings

## API Error Handling

### API Client (`lib/api/client.ts`)

**Requirements 1.2, 1.3, 6.2, 6.5**: Enhanced with error logging

Features:
- Automatic retry with exponential backoff (up to 3 attempts)
- User-friendly error message parsing
- Error logging for all API requests
- Network error detection
- Status code-based error messages

Error message examples:
- 400: "Invalid request: {message}"
- 401: "Authentication required. Please log in."
- 404: "The requested resource was not found."
- 429: "Too many requests. Please try again later."
- 500+: "Server error. Please try again later."
- Network: "Unable to connect to the server. Please check your internet connection."

### Upload Service (`lib/services/upload.ts`)

**Requirements 2.6, 6.3**: Enhanced with specific error messages

Features:
- File validation with specific error messages
- Upload progress tracking
- Error logging with file metadata
- Retry support

Error types:
- Invalid file type
- File size exceeds limit
- Network errors during upload
- Text extraction failures

## Usage Examples

### Example 1: Component with Error Boundary

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

function MyPage() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Custom error handling
        console.log('Error caught:', error)
      }}
    >
      <MyComponent />
    </ErrorBoundary>
  )
}
```

### Example 2: API Call with Error Handling

```tsx
import { useErrorHandler } from '@/hooks/use-error-handler'
import { apiClient } from '@/lib/api/client'

function MyComponent() {
  const { handleError } = useErrorHandler({
    componentName: 'MyComponent',
    showToast: true,
  })

  const fetchData = async () => {
    try {
      const data = await apiClient.get('/api/data')
      // Handle success
    } catch (error) {
      handleError(error, 'fetchData')
    }
  }

  return <button onClick={fetchData}>Fetch Data</button>
}
```

### Example 3: File Upload with Error Handling

```tsx
import { useErrorHandler } from '@/hooks/use-error-handler'
import { uploadOfferLetter } from '@/lib/services/upload'
import { ErrorMessage } from '@/components/ui/error-message'

function UploadComponent() {
  const { handleError, hasError, errorMessage, clearError } = useErrorHandler({
    componentName: 'UploadComponent',
    showToast: false, // We'll show inline error instead
  })

  const handleFileUpload = async (file: File) => {
    clearError()
    
    try {
      const result = await uploadOfferLetter(file, {
        onProgress: (progress) => {
          console.log(`Upload progress: ${progress.percentage}%`)
        },
      })
      // Handle success
    } catch (error) {
      handleError(error, 'handleFileUpload')
    }
  }

  return (
    <div>
      {hasError && (
        <ErrorMessage
          message={errorMessage}
          type="error"
          showRetry={true}
          onRetry={() => clearError()}
        />
      )}
      {/* Upload UI */}
    </div>
  )
}
```

### Example 4: Maintenance Mode Detection

```tsx
import { MaintenancePage } from '@/components/maintenance-page'
import { isServerError } from '@/lib/utils/error-logger'

function MyComponent() {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)

  const fetchData = async () => {
    try {
      await apiClient.get('/api/data')
    } catch (error) {
      if (error instanceof Error && isServerError(error)) {
        setIsMaintenanceMode(true)
      }
    }
  }

  if (isMaintenanceMode) {
    return <MaintenancePage onRetry={() => setIsMaintenanceMode(false)} />
  }

  return <div>Normal content</div>
}
```

## Error Logging

### Development Mode

Errors are logged to:
1. Browser console with full stack traces
2. localStorage (last 50 errors)

Access stored errors:
```typescript
import { getErrorLogsForDebug } from '@/lib/utils/error-logger'

const logs = getErrorLogsForDebug()
console.log(logs)
```

### Production Mode

Errors are:
1. Logged to console (minimal info)
2. Sent to error tracking service (TODO: integrate Sentry)
3. Stored in localStorage (last 50 errors)

## Testing Error Handling

### Test Error Boundary

```tsx
function ThrowError() {
  throw new Error('Test error')
}

<ErrorBoundary>
  <ThrowError />
</ErrorBoundary>
```

### Test API Error

```typescript
// Simulate network error
await apiClient.get('/api/nonexistent')

// Simulate server error
await apiClient.get('/api/error-500')
```

### Test Upload Error

```typescript
// Test file size error
const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf')
await uploadOfferLetter(largeFile)

// Test invalid file type
const invalidFile = new File(['test'], 'test.exe')
await uploadOfferLetter(invalidFile)
```

## Future Enhancements

1. **Error Tracking Integration**: Integrate with Sentry or similar service
2. **Error Recovery Strategies**: Implement automatic recovery for certain error types
3. **User Feedback**: Add feedback mechanism for users to report errors
4. **Error Analytics**: Track error patterns and frequencies
5. **Offline Support**: Better handling of offline scenarios
6. **Error Boundaries per Route**: More granular error boundaries for better UX

## Requirements Coverage

- ✅ **6.1**: Component errors caught by error boundaries
- ✅ **6.2**: API errors display user-friendly messages
- ✅ **6.3**: Upload errors show specific reasons
- ✅ **6.4**: Maintenance page for backend unavailability
- ✅ **6.5**: Errors logged for debugging

## Related Files

- `components/error-boundary.tsx` - Error boundary component
- `app/error.tsx` - Global error page
- `app/upload/error.tsx` - Upload error page
- `app/results/error.tsx` - Results error page
- `components/maintenance-page.tsx` - Maintenance page
- `lib/utils/error-logger.ts` - Error logging utility
- `hooks/use-error-handler.ts` - Error handler hook
- `components/ui/error-message.tsx` - Error message component
- `lib/api/client.ts` - API client with error handling
- `lib/services/upload.ts` - Upload service with error handling
