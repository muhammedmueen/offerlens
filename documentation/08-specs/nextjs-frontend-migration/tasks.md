# Implementation Plan: Next.js Frontend Migration

- [x] 1. Project Setup and Configuration











  - Set up Next.js 16 project structure with TypeScript
  - Configure environment variables for development and production
  - Install core dependencies (TanStack Query, Axios, Framer Motion, fast-check)
  - Configure ESLint and Prettier
  - Set up testing framework (Jest + React Testing Library)
  - _Requirements: 16.1, 16.2, 16.3, 19.1, 19.2, 19.3_

- [x] 2. API Client Implementation











  - Create Axios instance with base configuration
  - Implement request interceptors for headers and authentication
  - Implement response interceptors for error handling
  - Add retry logic with exponential backoff
  - Create API endpoint definitions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 2.1 Write property test for API base URL usage
  - **Property 1: API requests use configured base URL**
  - **Validates: Requirements 1.1**

- [ ]* 2.2 Write property test for retry logic
  - **Property 2: Failed requests retry with exponential backoff**
  - **Validates: Requirements 1.2**

- [ ]* 2.3 Write property test for error parsing
  - **Property 3: Error responses are parsed into user-friendly messages**
  - **Validates: Requirements 1.3**

- [ ]* 2.4 Write property test for request headers
  - **Property 4: All API requests include required headers**
  - **Validates: Requirements 1.5**

- [x] 3. State Management Setup








  - Create OfferContext with TypeScript interfaces
  - Implement useOffer hook
  - Set up TanStack Query client
  - Create QueryClientProvider wrapper
  - Add context to root layout
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ]* 3.1 Write property test for state storage
  - **Property 13: Uploaded offer data is stored in state**
  - **Validates: Requirements 4.1**

- [ ]* 3.2 Write property test for state persistence
  - **Property 14: State persists across navigation**
  - **Validates: Requirements 4.2**

- [ ]* 3.3 Write property test for loading state
  - **Property 15: Loading state prevents duplicate requests**
  - **Validates: Requirements 4.3**

- [ ]* 3.4 Write property test for shared state access
  - **Property 16: Multiple components access shared state**
  - **Validates: Requirements 4.5**



- [x] 4. File Upload Implementation




  - Create FileUpload component with drag-and-drop
  - Implement file validation (type, size)
  - Create upload service with progress tracking
  - Add upload progress UI
  - Implement error handling for uploads
  - Add navigation to results on success
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ]* 4.1 Write property test for valid file handling
  - **Property 5: Valid files trigger upload process**
  - **Validates: Requirements 2.2**

- [ ]* 4.2 Write property test for upload progress
  - **Property 6: Upload progress updates UI**
  - **Validates: Requirements 2.4**

- [ ]* 4.3 Write property test for successful upload navigation
  - **Property 7: Successful upload navigates to results**
  - **Validates: Requirements 2.5**

- [ ]* 4.4 Write property test for upload error handling
  - **Property 8: Failed uploads display error and allow retry**
  - **Validates: Requirements 2.6**

- [ ]* 4.5 Write unit test for file size validation
  - Test that files over 10MB are rejected
  - _Requirements: 2.3_

- [x] 5. Results Page Components





  - Migrate SalaryMeter component
  - Migrate RedFlagTag component
  - Migrate NegotiationCard component
  - Create results page layout
  - Implement take-home salary display
  - Add empty state for no red flags
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 5.1 Write property test for red flag display
  - **Property 9: All red flags are displayed**
  - **Validates: Requirements 3.1**

- [ ]* 5.2 Write property test for salary comparison display
  - **Property 10: Salary comparison shows all benchmarks**
  - **Validates: Requirements 3.2**

- [ ]* 5.3 Write property test for negotiation tips display
  - **Property 11: Negotiation tips are displayed**
  - **Validates: Requirements 3.3**

- [ ]* 5.4 Write property test for take-home calculation
  - **Property 12: Take-home salary is calculated and displayed**
  - **Validates: Requirements 3.4**

- [ ] 6. Checkpoint - Ensure core features work
  - Ensure all tests pass, ask the user if questions arise.
  - Test file upload flow end-to-end
  - Verify results display correctly
  - Check state management works



- [x] 7. Error Handling Implementation




  - Create ErrorBoundary component
  - Add error.tsx files for route segments
  - Implement API error handling
  - Add upload error handling
  - Create maintenance page component
  - Implement error logging
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 7.1 Write property test for error boundary
  - **Property 18: Component errors are caught by boundaries**
  - **Validates: Requirements 6.1**

- [ ]* 7.2 Write property test for API error messages
  - **Property 19: API errors display user-friendly messages**
  - **Validates: Requirements 6.2**

- [ ]* 7.3 Write property test for upload error messages
  - **Property 20: Upload errors show specific reasons**
  - **Validates: Requirements 6.3**

- [ ]* 7.4 Write property test for error logging
  - **Property 21: Errors are logged for debugging**
  - **Validates: Requirements 6.5**

- [x] 8. Loading States Implementation




  - Create loading.tsx files for route segments
  - Implement upload progress indicator
  - Create analysis loading animation
  - Add skeleton loaders for content
  - Implement UI disabling during operations
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 8.1 Write property test for navigation loading
  - **Property 22: Navigation shows loading indicators**
  - **Validates: Requirements 7.1**

- [ ]* 8.2 Write property test for upload progress display
  - **Property 23: Upload shows progress percentage**
  - **Validates: Requirements 7.2**

- [ ]* 8.3 Write property test for analysis loading
  - **Property 24: Analysis shows loading animation**
  - **Validates: Requirements 7.3**

- [ ]* 8.4 Write property test for skeleton loaders
  - **Property 25: Data fetching shows skeleton loaders**
  - **Validates: Requirements 7.4**

- [ ]* 8.5 Write property test for UI disabling
  - **Property 26: Long operations disable affected UI**
  - **Validates: Requirements 7.5**


- [x] 9. Routing and Navigation





  - Set up app router structure
  - Create home page (SSG)
  - Create upload page (CSR)
  - Create results page (CSR)
  - Create forum page (SSR)
  - Create feature request page (CSR)
  - Create 404 not-found page
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ]* 9.1 Write property test for navigation
  - **Property 17: Navigation actions update the URL**
  - **Validates: Requirements 5.3**

- [ ]* 9.2 Write unit tests for specific routes
  - Test home page renders correctly
  - Test upload page navigation
  - Test forum page navigation
  - Test feature request navigation
  - Test 404 page for invalid URLs
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [x] 10. Responsive Design Implementation





  - Implement mobile-optimized layouts
  - Add tablet-specific adjustments
  - Ensure desktop layout works
  - Test window resize behavior
  - Implement touch gesture support
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 10.1 Write property test for layout responsiveness
  - **Property 27: Layout adapts to window resize**
  - **Validates: Requirements 8.4**

- [ ]* 10.2 Write property test for touch gestures
  - **Property 28: Touch gestures trigger appropriate responses**
  - **Validates: Requirements 8.5**

- [ ]* 10.3 Write unit tests for responsive breakpoints
  - Test mobile layout (< 640px)
  - Test tablet layout (640px - 1024px)
  - Test desktop layout (> 1024px)
  - _Requirements: 8.1, 8.2, 8.3_



- [x] 11. Animations and Interactions




  - Implement home page load animations
  - Add hover effects to interactive elements
  - Implement reduced motion support
  - Add button click feedback
  - Implement scroll-based navbar updates
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 11.1 Write property test for home page animations
  - **Property 29: Home page elements animate on load**
  - **Validates: Requirements 9.1**

- [ ]* 11.2 Write property test for hover feedback
  - **Property 30: Interactive elements provide hover feedback**
  - **Validates: Requirements 9.2**

- [ ]* 11.3 Write property test for click feedback
  - **Property 31: Buttons provide click feedback**
  - **Validates: Requirements 9.4**

- [ ]* 11.4 Write property test for navbar scroll behavior
  - **Property 32: Navbar updates on scroll**
  - **Validates: Requirements 9.5**

- [ ]* 11.5 Write unit test for reduced motion
  - Test animations are disabled with prefers-reduced-motion
  - _Requirements: 9.3_

- [x] 12. Accessibility Implementation





  - Add keyboard navigation support
  - Implement ARIA labels and descriptions
  - Add skip link to main content
  - Ensure all images have alt text
  - Add non-color indicators for color-coded info
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 12.1 Write property test for focus indicators
  - **Property 33: Keyboard navigation shows focus indicators**
  - **Validates: Requirements 10.1**

- [ ]* 12.2 Write property test for ARIA labels
  - **Property 34: Elements have ARIA labels**
  - **Validates: Requirements 10.2**

- [ ]* 12.3 Write property test for image alt text
  - **Property 35: Images have alt text**
  - **Validates: Requirements 10.4**

- [ ]* 12.4 Write property test for non-color indicators
  - **Property 36: Color-coded info has non-color indicators**
  - **Validates: Requirements 10.5**

- [ ]* 12.5 Write unit test for skip link
  - Test skip link is present and functional
  - _Requirements: 10.3_


- [x] 13. SEO Optimization





  - Implement server-side rendering for appropriate pages
  - Add meta tags to all pages
  - Add Open Graph tags for social sharing
  - Create sitemap.xml
  - Create robots.txt
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ]* 13.1 Write property test for SSR
  - **Property 37: Pages provide server-rendered HTML**
  - **Validates: Requirements 11.1**

- [ ]* 13.2 Write property test for meta tags
  - **Property 38: Pages include meta tags**
  - **Validates: Requirements 11.2**

- [ ]* 13.3 Write property test for Open Graph tags
  - **Property 39: Pages include Open Graph tags**
  - **Validates: Requirements 11.3**

- [ ]* 13.4 Write unit tests for SEO files
  - Test sitemap.xml exists and is valid
  - Test robots.txt exists and has correct directives
  - _Requirements: 11.4, 11.5_

- [x] 14. Performance Optimization





  - Replace img tags with Next.js Image component
  - Implement font optimization
  - Add link prefetching
  - Verify code splitting
  - Run Lighthouse audit
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]* 14.1 Write property test for Image component usage
  - **Property 40: Images use Next.js Image component**
  - **Validates: Requirements 12.2**

- [ ]* 14.2 Write property test for link prefetching
  - **Property 41: Navigation prefetches linked pages**
  - **Validates: Requirements 12.4**

- [ ]* 14.3 Write unit tests for performance features
  - Test font optimization is configured
  - Test code splitting produces separate bundles
  - _Requirements: 12.3, 12.5_

- [x] 15. Checkpoint - Ensure quality standards met





  - Ensure all tests pass, ask the user if questions arise.
  - Run Lighthouse audit (target: 90+ performance)
  - Test accessibility with screen reader
  - Verify SEO meta tags
  - Check responsive design on real devices


- [x] 16. Feature Request Implementation





  - Create feature request form component
  - Implement form validation
  - Connect form to backend API
  - Add success message display
  - Implement error handling with data preservation
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ]* 16.1 Write property test for form validation
  - **Property 42: Forms validate required fields**
  - **Validates: Requirements 13.2**

- [ ]* 16.2 Write property test for form submission
  - **Property 43: Form submissions call the API**
  - **Validates: Requirements 13.3**

- [ ]* 16.3 Write property test for success handling
  - **Property 44: Successful submissions show success message**
  - **Validates: Requirements 13.4**

- [ ]* 16.4 Write property test for error handling
  - **Property 45: Failed submissions preserve form data**
  - **Validates: Requirements 13.5**

- [ ]* 16.5 Write unit test for form display
  - Test feature request page displays form
  - _Requirements: 13.1_

- [x] 17. Forum Implementation





  - Create forum list component
  - Implement forum post display
  - Add discussion thread view
  - Implement skeleton loaders
  - Add error handling for API failures
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ]* 17.1 Write property test for post display
  - **Property 46: Forum posts display all required fields**
  - **Validates: Requirements 14.2**

- [ ]* 17.2 Write property test for thread navigation
  - **Property 47: Clicking discussions displays full thread**
  - **Validates: Requirements 14.3**

- [ ]* 17.3 Write property test for forum loading
  - **Property 48: Forum loading shows skeleton loaders**
  - **Validates: Requirements 14.4**

- [ ]* 17.4 Write unit tests for forum features
  - Test forum page displays discussion list
  - Test forum API error displays message
  - _Requirements: 14.1, 14.5_


- [x] 18. Theme Support Implementation





  - Implement theme detection from system preferences
  - Create theme toggle component
  - Add theme persistence to local storage
  - Implement theme restoration on load
  - Add smooth theme transition animations
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ]* 18.1 Write property test for theme detection
  - **Property 49: System theme preference is detected**
  - **Validates: Requirements 15.1**

- [ ]* 18.2 Write property test for theme toggle
  - **Property 50: Theme toggle switches themes**
  - **Validates: Requirements 15.2**

- [ ]* 18.3 Write property test for theme persistence
  - **Property 51: Theme preference is persisted**
  - **Validates: Requirements 15.3**

- [ ]* 18.4 Write property test for theme restoration
  - **Property 52: Saved theme is restored**
  - **Validates: Requirements 15.4**

- [ ]* 18.5 Write property test for theme transitions
  - **Property 53: Theme transitions are animated**
  - **Validates: Requirements 15.5**

- [x] 19. Analytics Integration





  - Set up Vercel Analytics
  - Implement page view tracking
  - Add conversion event tracking
  - Track feature request submissions
  - Implement privacy preference checking
  - Disable analytics in development
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ]* 19.1 Write property test for page view tracking
  - **Property 54: Page views are tracked**
  - **Validates: Requirements 17.1**

- [ ]* 19.2 Write property test for conversion tracking
  - **Property 55: Conversions are tracked**
  - **Validates: Requirements 17.2**

- [ ]* 19.3 Write property test for submission tracking
  - **Property 56: Form submissions are tracked**
  - **Validates: Requirements 17.3**

- [ ]* 19.4 Write property test for privacy preferences
  - **Property 57: Privacy preferences are respected**
  - **Validates: Requirements 17.4**

- [ ]* 19.5 Write unit test for development mode
  - Test analytics is disabled in development
  - _Requirements: 17.5_


- [x] 20. Backward Compatibility





  - Verify API request format matches Vite frontend
  - Ensure authentication mechanism is compatible
  - Use compatible local storage keys
  - Handle both old and new API response formats
  - Test with production backend
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ]* 20.1 Write property test for API format compatibility
  - **Property 58: API requests match Vite frontend format**
  - **Validates: Requirements 18.1**

- [ ]* 20.2 Write property test for auth compatibility
  - **Property 59: Authentication mechanism is compatible**
  - **Validates: Requirements 18.2**

- [ ]* 20.3 Write property test for storage compatibility
  - **Property 60: Local storage keys are compatible**
  - **Validates: Requirements 18.3**

- [ ]* 20.4 Write property test for response format handling
  - **Property 61: Both API response formats are handled**
  - **Validates: Requirements 18.4**

- [ ]* 20.5 Write integration test for backend compatibility
  - Test complete flow with production backend
  - _Requirements: 18.5_

- [x] 21. Final Testing and Polish










  - Run all property-based tests (100 iterations each)
  - Run all unit tests
  - Fix any failing tests
  - Test all user flows manually
  - Fix responsive design issues
  - Optimize bundle size
  - Run final Lighthouse audit
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 22. Deployment Preparation









  - Configure environment variables in Vercel
  - Set up production and preview environments
  - Configure custom domain
  - Set up monitoring and alerts
  - Create deployment documentation
  - _Requirements: 16.4, 16.5_


- [x] 23. Production Deployment







  - Deploy to Vercel preview environment
  - Test preview deployment thoroughly
  - Deploy to production
  - Monitor for errors and performance issues
  - Verify analytics are working
  - Test with real users
  - _Requirements: 18.5_

- [x] 24. Final Checkpoint - Verify production readiness





  - Ensure all tests pass, ask the user if questions arise.
  - Verify all features work in production
  - Check Lighthouse scores (target: 90+)
  - Verify SEO meta tags are correct
  - Test on multiple devices and browsers
  - Monitor error rates and performance
