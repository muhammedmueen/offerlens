# Design Document: Next.js Frontend Migration

## Overview

This document outlines the technical design for migrating the OfferLens frontend from a Vite + React SPA to a Next.js 16 + React 19 application. The migration will preserve all existing functionality while adding modern UI enhancements, improving SEO, and optimizing performance.

### Goals
- Maintain 100% feature parity with the existing Vite frontend
- Improve initial page load performance by 40%+ through SSR
- Achieve Lighthouse performance score of 90+
- Enhance SEO with server-side rendering and meta tags
- Add modern animations and interactions using Framer Motion
- Improve accessibility with WCAG 2.1 AA compliance
- Provide better developer experience with Next.js tooling

### Non-Goals
- Changing the backend API (must remain compatible)
- Rewriting business logic (migrate as-is)
- Adding new features beyond UI enhancements
- Changing the design system colors or branding

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  App Router (File-based Routing)                            │
│  ├── app/                                                    │
│  │   ├── layout.tsx (Root Layout + Providers)              │
│  │   ├── page.tsx (Home Page - SSG)                        │
│  │   ├── upload/page.tsx (Upload Page - CSR)               │
│  │   ├── results/page.tsx (Results Page - CSR)             │
│  │   ├── forum/page.tsx (Forum Page - SSR)                 │
│  │   └── feature-request/page.tsx (Feature Request - CSR)  │
├─────────────────────────────────────────────────────────────┤
│  Components Layer                                            │
│  ├── Server Components (Default)                            │
│  ├── Client Components ("use client")                       │
│  └── Shared UI Components                                   │
├─────────────────────────────────────────────────────────────┤
│  State Management                                            │
│  ├── React Context (Offer Data)                             │
│  ├── TanStack Query (API Caching)                           │
│  └── Local State (UI State)                                 │
├─────────────────────────────────────────────────────────────┤
│  API Client Layer                                            │
│  ├── Axios Instance (HTTP Client)                           │
│  ├── Request Interceptors (Headers, Auth)                   │
│  ├── Response Interceptors (Error Handling)                 │
│  └── Retry Logic (Exponential Backoff)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Existing Backend API (Unchanged)                │
│  ├── /api/analyze (POST)                                    │
│  ├── /api/feature-requests (POST, GET)                      │
│  └── /api/forum (GET)                                       │
└─────────────────────────────────────────────────────────────┘
```


### Rendering Strategy

| Page | Strategy | Reason |
|------|----------|--------|
| Home (`/`) | SSG (Static Site Generation) | Marketing page, rarely changes, best SEO |
| Upload (`/upload`) | CSR (Client-Side Rendering) | Interactive file upload, needs client APIs |
| Results (`/results`) | CSR | Dynamic data from upload, client-only |
| Forum (`/forum`) | SSR (Server-Side Rendering) | Dynamic content, good SEO, fresh data |
| Feature Request (`/feature-request`) | CSR | Form submission, client interaction |
| 404 | SSG | Static error page |

## Components and Interfaces

### API Client Module

```typescript
// lib/api/client.ts
interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: unknown;
}

class ApiClient {
  private axios: AxiosInstance;
  
  constructor(config: ApiClientConfig);
  
  // Core methods
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  
  // Retry logic
  private retryRequest<T>(fn: () => Promise<T>, attempts: number): Promise<T>;
  
  // Error handling
  private handleError(error: unknown): ApiError;
}
```

### File Upload Service

```typescript
// lib/services/upload.ts
interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

interface AnalysisResult {
  redFlags: RedFlag[];
  salaryComparison: SalaryComparison;
  negotiationTips: string[];
  takeHomeSalary: number;
}

async function uploadOfferLetter(
  file: File,
  options?: UploadOptions
): Promise<AnalysisResult>;

function validateFile(file: File): { valid: boolean; error?: string };
```

### State Management

```typescript
// context/OfferContext.tsx
interface OfferState {
  currentOffer: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
}

interface OfferContextValue extends OfferState {
  setOffer: (offer: AnalysisResult) => void;
  clearOffer: () => void;
  setAnalyzing: (analyzing: boolean) => void;
  setError: (error: string | null) => void;
}

const OfferContext = createContext<OfferContextValue | undefined>(undefined);

function useOffer(): OfferContextValue;
```


## Data Models

### Analysis Result

```typescript
interface RedFlag {
  id: string;
  category: 'bond' | 'non-compete' | 'notice-period' | 'probation' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestion: string;
}

interface SalaryComparison {
  offered: number;
  marketMin: number;
  marketMax: number;
  marketMedian: number;
  percentile: number;
  verdict: 'below' | 'fair' | 'good' | 'excellent';
}

interface AnalysisResult {
  id: string;
  redFlags: RedFlag[];
  salaryComparison: SalaryComparison;
  negotiationTips: string[];
  takeHomeSalary: number;
  analyzedAt: string;
}
```

### Feature Request

```typescript
interface FeatureRequest {
  id?: string;
  type: 'feature' | 'bug' | 'improvement';
  title: string;
  description: string;
  email?: string;
  createdAt?: string;
}
```

### Forum Post

```typescript
interface ForumPost {
  id: string;
  author: string;
  title: string;
  content: string;
  replies: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

Before defining properties, I've analyzed the requirements to eliminate redundancy:

**Redundancies Identified:**
- Properties 5.1-5.5 (specific navigation examples) can be combined into a general navigation property
- Properties 8.1-8.3 (responsive design examples) are examples, not universal properties
- Properties 11.4-11.5 (sitemap/robots.txt) are examples of static file presence
- Properties 16.1-16.3 (environment-specific config) are examples, not properties

**Consolidated Approach:**
- Navigation: One property for all navigation actions
- Responsive design: Test at multiple breakpoints as examples
- SEO files: Verify presence as examples
- Environment config: Test as examples for each environment


### API Client Properties

**Property 1: API requests use configured base URL**
*For any* API endpoint path, when making a request, the full URL should start with the configured base URL from environment variables.
**Validates: Requirements 1.1**

**Property 2: Failed requests retry with exponential backoff**
*For any* API request that fails due to network issues, the system should retry up to 3 times with exponentially increasing delays between attempts.
**Validates: Requirements 1.2**

**Property 3: Error responses are parsed into user-friendly messages**
*For any* API error response, the system should extract the error information and convert it into a user-friendly message format.
**Validates: Requirements 1.3**

**Property 4: All API requests include required headers**
*For any* API request, the request headers should include Content-Type and Accept headers with appropriate values.
**Validates: Requirements 1.5**

### File Upload Properties

**Property 5: Valid files trigger upload process**
*For any* valid file (PDF or image under 10MB), dropping or selecting the file should initiate the upload process and update the UI state.
**Validates: Requirements 2.2**

**Property 6: Upload progress updates UI**
*For any* file upload in progress, progress callbacks should update the UI with the current percentage completed.
**Validates: Requirements 2.4**

**Property 7: Successful upload navigates to results**
*For any* completed file upload, the system should navigate to the results page with the analysis data in the URL or state.
**Validates: Requirements 2.5**

**Property 8: Failed uploads display error and allow retry**
*For any* failed file upload, the system should display an error message and keep the upload UI in a state that allows retry.
**Validates: Requirements 2.6**

### Results Display Properties

**Property 9: All red flags are displayed**
*For any* analysis result containing red flags, all red flags should be rendered in the UI with their severity indicators visible.
**Validates: Requirements 3.1**

**Property 10: Salary comparison shows all benchmarks**
*For any* analysis result with salary data, the UI should display the offered salary, market min, max, median, and percentile.
**Validates: Requirements 3.2**

**Property 11: Negotiation tips are displayed**
*For any* analysis result with negotiation tips, all tips should be rendered in the UI.
**Validates: Requirements 3.3**

**Property 12: Take-home salary is calculated and displayed**
*For any* analysis result with salary data, the take-home salary should be calculated and displayed in the UI.
**Validates: Requirements 3.4**

### State Management Properties

**Property 13: Uploaded offer data is stored in state**
*For any* successful file upload, the resulting offer data should be stored in the application state and accessible to components.
**Validates: Requirements 4.1**

**Property 14: State persists across navigation**
*For any* navigation action within the app, relevant state data should remain accessible after navigation completes.
**Validates: Requirements 4.2**

**Property 15: Loading state prevents duplicate requests**
*For any* pending API request, the loading state should be true, and attempting another request should be prevented or queued.
**Validates: Requirements 4.3**

**Property 16: Multiple components access shared state**
*For any* data stored in shared state, multiple components should be able to access the same data instance.
**Validates: Requirements 4.5**

### Navigation Properties

**Property 17: Navigation actions update the URL**
*For any* navigation action (button click, link click, programmatic navigation), the browser URL should update to reflect the new route.
**Validates: Requirements 5.3**


### Error Handling Properties

**Property 18: Component errors are caught by boundaries**
*For any* component that throws an error, an error boundary should catch the error and display a fallback UI instead of crashing the app.
**Validates: Requirements 6.1**

**Property 19: API errors display user-friendly messages**
*For any* failed API request, the system should display a user-friendly error message derived from the error response.
**Validates: Requirements 6.2**

**Property 20: Upload errors show specific reasons**
*For any* failed file upload, the error message should include the specific reason for failure (size, type, network, etc.).
**Validates: Requirements 6.3**

**Property 21: Errors are logged for debugging**
*For any* unexpected error, the error details should be logged to the console or error tracking service.
**Validates: Requirements 6.5**

### Loading State Properties

**Property 22: Navigation shows loading indicators**
*For any* page navigation, a loading indicator should be visible until the new page is ready to display.
**Validates: Requirements 7.1**

**Property 23: Upload shows progress percentage**
*For any* file upload, the UI should display the current upload progress as a percentage.
**Validates: Requirements 7.2**

**Property 24: Analysis shows loading animation**
*For any* pending analysis request, a loading animation should be visible in the UI.
**Validates: Requirements 7.3**

**Property 25: Data fetching shows skeleton loaders**
*For any* API data fetch, skeleton loaders should be displayed in content areas until data arrives.
**Validates: Requirements 7.4**

**Property 26: Long operations disable affected UI**
*For any* long-running operation, the affected UI elements should be disabled to prevent user interaction.
**Validates: Requirements 7.5**


### Responsive Design Properties

**Property 27: Layout adapts to window resize**
*For any* browser window resize, the layout should adjust smoothly without breaking or causing horizontal scroll.
**Validates: Requirements 8.4**

**Property 28: Touch gestures trigger appropriate responses**
*For any* touch gesture (tap, swipe) on touch-enabled devices, the system should respond with the appropriate action.
**Validates: Requirements 8.5**

### Animation Properties

**Property 29: Home page elements animate on load**
*For any* home page load, elements should animate into view with staggered timing.
**Validates: Requirements 9.1**

**Property 30: Interactive elements provide hover feedback**
*For any* interactive element (button, link), hovering should trigger visual feedback.
**Validates: Requirements 9.2**

**Property 31: Buttons provide click feedback**
*For any* button click, the system should provide tactile feedback through micro-interactions.
**Validates: Requirements 9.4**

**Property 32: Navbar updates on scroll**
*For any* scroll action, the navbar appearance should update based on the scroll position.
**Validates: Requirements 9.5**

### Accessibility Properties

**Property 33: Keyboard navigation shows focus indicators**
*For any* interactive element receiving keyboard focus, a visible focus indicator should be displayed.
**Validates: Requirements 10.1**

**Property 34: Elements have ARIA labels**
*For any* interactive element or complex component, appropriate ARIA labels and descriptions should be present.
**Validates: Requirements 10.2**

**Property 35: Images have alt text**
*For any* image element, a descriptive alt attribute should be present.
**Validates: Requirements 10.4**

**Property 36: Color-coded info has non-color indicators**
*For any* color-coded information (red flags, salary verdicts), additional non-color indicators should be present.
**Validates: Requirements 10.5**


### SEO Properties

**Property 37: Pages provide server-rendered HTML**
*For any* page request from a search engine crawler, the response should include fully rendered HTML content.
**Validates: Requirements 11.1**

**Property 38: Pages include meta tags**
*For any* page, the HTML should include meta tags for title, description, and keywords.
**Validates: Requirements 11.2**

**Property 39: Pages include Open Graph tags**
*For any* page, the HTML should include Open Graph tags for social media sharing.
**Validates: Requirements 11.3**

### Performance Properties

**Property 40: Images use Next.js Image component**
*For any* image rendered in the application, the Next.js Image component should be used for automatic optimization.
**Validates: Requirements 12.2**

**Property 41: Navigation prefetches linked pages**
*For any* visible link to another page, the system should prefetch that page's resources for instant navigation.
**Validates: Requirements 12.4**

### Form Properties

**Property 42: Forms validate required fields**
*For any* form submission, all required fields should be validated before the submission is sent to the API.
**Validates: Requirements 13.2**

**Property 43: Form submissions call the API**
*For any* valid form submission, an API request should be made with the form data.
**Validates: Requirements 13.3**

**Property 44: Successful submissions show success message**
*For any* successful form submission, a success message should be displayed and the form should be cleared.
**Validates: Requirements 13.4**

**Property 45: Failed submissions preserve form data**
*For any* failed form submission, the form data should be preserved and an error message should be displayed.
**Validates: Requirements 13.5**


### Forum Properties

**Property 46: Forum posts display all required fields**
*For any* forum post rendered in the UI, the author, timestamp, and content should all be visible.
**Validates: Requirements 14.2**

**Property 47: Clicking discussions displays full thread**
*For any* discussion link clicked, the system should navigate to and display the full thread.
**Validates: Requirements 14.3**

**Property 48: Forum loading shows skeleton loaders**
*For any* forum data fetch, skeleton loaders should be displayed until the data arrives.
**Validates: Requirements 14.4**

### Theme Properties

**Property 49: System theme preference is detected**
*For any* initial site visit, the system should detect and apply the user's system theme preference (light/dark).
**Validates: Requirements 15.1**

**Property 50: Theme toggle switches themes**
*For any* theme toggle click, the system should switch between light and dark themes.
**Validates: Requirements 15.2**

**Property 51: Theme preference is persisted**
*For any* theme change, the preference should be saved to local storage.
**Validates: Requirements 15.3**

**Property 52: Saved theme is restored**
*For any* site visit after a theme has been saved, the saved theme preference should be applied.
**Validates: Requirements 15.4**

**Property 53: Theme transitions are animated**
*For any* theme change, the transition should be animated smoothly.
**Validates: Requirements 15.5**

### Analytics Properties

**Property 54: Page views are tracked**
*For any* page navigation, a page view event should be sent to the analytics service.
**Validates: Requirements 17.1**

**Property 55: Conversions are tracked**
*For any* completed offer analysis, a conversion event should be sent to the analytics service.
**Validates: Requirements 17.2**

**Property 56: Form submissions are tracked**
*For any* feature request submission, a submission event should be sent to the analytics service.
**Validates: Requirements 17.3**

**Property 57: Privacy preferences are respected**
*For any* analytics tracking, the system should check user privacy preferences and skip tracking if opted out.
**Validates: Requirements 17.4**


### Backward Compatibility Properties

**Property 58: API requests match Vite frontend format**
*For any* API request, the request format (headers, body structure) should match the format used by the Vite frontend.
**Validates: Requirements 18.1**

**Property 59: Authentication mechanism is compatible**
*For any* authenticated request, the authentication mechanism should match the existing Vite frontend implementation.
**Validates: Requirements 18.2**

**Property 60: Local storage keys are compatible**
*For any* data stored in local storage, the key names should match those used by the Vite frontend.
**Validates: Requirements 18.3**

**Property 61: Both API response formats are handled**
*For any* API response, the system should correctly parse both old and new response formats.
**Validates: Requirements 18.4**

## Error Handling

### Error Boundary Strategy

```typescript
// components/ErrorBoundary.tsx
interface ErrorBoundaryProps {
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Catches errors in child components
  // Logs errors to console/service
  // Displays fallback UI
  // Provides reset functionality
}
```

### Error Types and Handling

| Error Type | Handling Strategy | User Message |
|------------|------------------|--------------|
| Network Error | Retry with exponential backoff | "Connection issue. Retrying..." |
| API Error (4xx) | Display specific error message | Error message from API |
| API Error (5xx) | Display generic error, log details | "Server error. Please try again." |
| File Too Large | Prevent upload, show size limit | "File must be under 10MB" |
| Invalid File Type | Prevent upload, show allowed types | "Please upload PDF or image" |
| Component Error | Error boundary catches, show fallback | "Something went wrong. Refresh?" |
| Missing State | Redirect to home, show message | "Session expired. Please start over." |


## Testing Strategy

### Dual Testing Approach

The application will use both unit testing and property-based testing to ensure comprehensive coverage:

- **Unit tests** verify specific examples, edge cases, and error conditions
- **Property tests** verify universal properties that should hold across all inputs
- Together they provide comprehensive coverage: unit tests catch concrete bugs, property tests verify general correctness

### Property-Based Testing

**Library:** `@fast-check/jest` (for Jest integration with fast-check)

**Configuration:**
- Each property-based test should run a minimum of 100 iterations
- Each property-based test must be tagged with a comment referencing the design document property
- Tag format: `**Feature: nextjs-frontend-migration, Property {number}: {property_text}**`
- Each correctness property must be implemented by a SINGLE property-based test

**Example Property Test:**

```typescript
/**
 * **Feature: nextjs-frontend-migration, Property 1: API requests use configured base URL**
 */
test('API requests always use configured base URL', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }), // Random endpoint path
      (endpoint) => {
        const client = new ApiClient({ baseURL: 'https://api.example.com' });
        const fullUrl = client.buildUrl(endpoint);
        expect(fullUrl).toStartWith('https://api.example.com');
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

**Library:** Jest + React Testing Library

**Coverage Areas:**
- Component rendering with specific props
- User interactions (clicks, form submissions)
- Edge cases (empty states, error states)
- Integration between components

**Example Unit Test:**

```typescript
test('FileUpload rejects files larger than 10MB', () => {
  const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf');
  const { getByText } = render(<FileUpload />);
  
  fireEvent.drop(getByText('Drop file here'), {
    dataTransfer: { files: [largeFile] }
  });
  
  expect(getByText(/file must be under 10mb/i)).toBeInTheDocument();
});
```

### Test Organization

```
__tests__/
├── unit/
│   ├── components/
│   │   ├── FileUpload.test.tsx
│   │   ├── SalaryMeter.test.tsx
│   │   └── RedFlagTag.test.tsx
│   ├── lib/
│   │   ├── api-client.test.ts
│   │   └── upload-service.test.ts
│   └── hooks/
│       └── useOffer.test.ts
└── properties/
    ├── api-client.properties.test.ts
    ├── file-upload.properties.test.ts
    ├── state-management.properties.test.ts
    └── navigation.properties.test.ts
```


## Implementation Details

### File Structure

```
offerlens-frontend(new)/
├── app/
│   ├── layout.tsx                 # Root layout with providers
│   ├── page.tsx                   # Home page (SSG)
│   ├── upload/
│   │   ├── page.tsx              # Upload page (CSR)
│   │   └── loading.tsx           # Loading UI
│   ├── results/
│   │   ├── page.tsx              # Results page (CSR)
│   │   ├── loading.tsx           # Loading UI
│   │   └── error.tsx             # Error UI
│   ├── forum/
│   │   ├── page.tsx              # Forum page (SSR)
│   │   └── loading.tsx           # Loading UI
│   ├── feature-request/
│   │   └── page.tsx              # Feature request (CSR)
│   ├── not-found.tsx             # 404 page
│   └── error.tsx                 # Global error page
├── components/
│   ├── animations/               # Framer Motion components
│   ├── upload/                   # Upload-specific components
│   ├── results/                  # Results-specific components
│   ├── forum/                    # Forum-specific components
│   ├── feature-request/          # Feature request components
│   ├── home/                     # Home page sections
│   └── ui/                       # Shared UI components
├── lib/
│   ├── api/
│   │   ├── client.ts            # Axios client with retry
│   │   └── endpoints.ts         # API endpoint definitions
│   ├── services/
│   │   ├── upload.ts            # File upload service
│   │   ├── analysis.ts          # Analysis service
│   │   └── forum.ts             # Forum service
│   └── utils.ts                 # Utility functions
├── context/
│   └── OfferContext.tsx         # Offer state management
├── hooks/
│   ├── useOffer.ts              # Offer context hook
│   ├── useAnalysis.ts           # Analysis hook
│   └── useToast.ts              # Toast notifications
├── types/
│   ├── api.ts                   # API types
│   ├── offer.ts                 # Offer types
│   └── forum.ts                 # Forum types
└── __tests__/                   # Test files
```

### Migration Phases

**Phase 1: Foundation (Days 1-2)**
- Set up Next.js project structure
- Configure environment variables
- Create API client with retry logic
- Set up TanStack Query
- Create OfferContext

**Phase 2: Core Features (Days 3-5)**
- Migrate FileUpload component
- Migrate upload service
- Migrate Results page components (SalaryMeter, RedFlagTag, NegotiationCard)
- Implement error boundaries
- Add loading states

**Phase 3: Additional Features (Days 6-7)**
- Migrate Feature Request form
- Migrate Forum components
- Add analytics integration
- Implement theme switching

**Phase 4: Polish & Testing (Days 8-10)**
- Write property-based tests
- Write unit tests
- Fix responsive issues
- Optimize performance
- Add accessibility features

**Phase 5: Deployment (Day 11)**
- Deploy to Vercel
- Configure environment variables
- Test production build
- Monitor for issues


### Key Technical Decisions

**1. Why Next.js App Router over Pages Router?**
- File-based routing is more intuitive
- Better support for React Server Components
- Improved performance with automatic code splitting
- Built-in loading and error states

**2. Why TanStack Query over SWR?**
- More mature and feature-rich
- Better TypeScript support
- Existing familiarity from Vite frontend
- Powerful caching and invalidation

**3. Why Framer Motion over CSS animations?**
- More powerful animation capabilities
- Better accessibility (respects reduced motion)
- Easier to create complex animations
- Good TypeScript support

**4. Why Axios over Fetch?**
- Automatic request/response transformation
- Interceptors for global error handling
- Better timeout support
- Request cancellation
- Existing familiarity from Vite frontend

**5. Why Client-Side Rendering for Upload/Results?**
- File upload requires browser APIs
- Results depend on upload state
- No SEO benefit for these pages
- Better user experience with client-side state

### Performance Optimizations

**Image Optimization:**
- Use Next.js Image component for all images
- Lazy load images below the fold
- Provide appropriate sizes for responsive images
- Use WebP format with fallbacks

**Code Splitting:**
- Automatic route-based splitting by Next.js
- Dynamic imports for heavy components (3D graphics, charts)
- Lazy load Framer Motion animations

**Caching Strategy:**
- Static pages (home, 404) cached indefinitely
- API responses cached with TanStack Query
- Stale-while-revalidate for forum data
- No caching for upload/results (user-specific)

**Bundle Size:**
- Tree-shake unused dependencies
- Use dynamic imports for large libraries
- Minimize third-party dependencies
- Monitor bundle size with Next.js analyzer

### Security Considerations

**API Security:**
- HTTPS only in production
- CORS headers validated by backend
- No sensitive data in client-side code
- API keys in environment variables only

**File Upload Security:**
- Client-side file type validation
- Client-side file size validation
- Server-side validation (backend responsibility)
- No file execution on client

**XSS Prevention:**
- React's built-in XSS protection
- Sanitize user input before display
- Use dangerouslySetInnerHTML sparingly
- Content Security Policy headers

**Data Privacy:**
- No persistent storage of offer data
- Clear state on navigation away
- Analytics respects privacy preferences
- No tracking in development mode


## Deployment Strategy

### Environment Configuration

**Development (.env.local):**
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NODE_ENV=development
```

**Production (.env.production):**
```env
NEXT_PUBLIC_API_URL=https://api.offerlens.com
NEXT_PUBLIC_APP_URL=https://offerlens.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NODE_ENV=production
```

### Vercel Deployment

**Build Configuration:**
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Node Version: 20.x

**Environment Variables:**
- Set in Vercel dashboard
- Separate values for preview and production
- Encrypted at rest

**Deployment Process:**
1. Push to GitHub
2. Vercel auto-deploys preview
3. Test preview deployment
4. Merge to main for production
5. Monitor production deployment

### Monitoring and Analytics

**Vercel Analytics:**
- Real User Monitoring (RUM)
- Core Web Vitals tracking
- Page load performance
- Error tracking

**Custom Analytics:**
- Page view tracking
- Conversion tracking (offer analysis)
- Feature request submissions
- User journey tracking

### Rollback Strategy

**If issues occur:**
1. Identify the problem in Vercel dashboard
2. Revert to previous deployment (one-click)
3. Fix issue in development
4. Deploy fix to preview
5. Test thoroughly
6. Deploy to production

**Monitoring for issues:**
- Watch error rates in Vercel dashboard
- Monitor Core Web Vitals scores
- Check user feedback channels
- Review analytics for drop-offs

