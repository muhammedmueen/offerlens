# OfferLens Frontend

React-based frontend application for OfferLens - A privacy-first job offer analysis platform.

## Features

- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- 🎨 **Modern UI**: Built with Shadcn/ui and TailwindCSS
- 📄 **File Upload**: Support for PDF and image files with OCR
- 🔍 **Real-time Analysis**: Instant offer letter analysis
- 💡 **Interactive Results**: Visual salary comparison and red flag detection
- 🌙 **Dark Mode**: Toggle between light and dark themes
- 📊 **PDF Export**: Download analysis results as PDF
- 🎯 **Feature Requests**: Submit and vote on feature requests
- ⚡ **Fast**: Optimized with Vite for lightning-fast development and builds

## Prerequisites

- Node.js 20+
- npm 10+
- Backend API running (see [backend README](../offerlens-backend/README.md))

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# API Configuration
VITE_API_URL=http://localhost:3001/api/v1

# Feature Flags (optional)
VITE_ENABLE_FORUM=true
VITE_ENABLE_ANALYTICS=false
```

**Important**: The `VITE_API_URL` must match your backend URL.

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## Available Scripts

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking

### Testing
- `npm test` - Run tests (if configured)
- `npm run test:watch` - Run tests in watch mode

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Shadcn/ui base components
│   ├── FileUpload.tsx  # File upload component
│   ├── ProgressSteps.tsx
│   ├── SalaryMeter.tsx
│   ├── RedFlagTag.tsx
│   └── ...
├── pages/              # Page components
│   ├── Home.tsx        # Landing page
│   ├── Upload.tsx      # Upload page
│   ├── Results.tsx     # Analysis results page
│   ├── FeatureRequest.tsx
│   └── Forum.tsx       # Feedback forum
├── context/            # React context
│   └── OfferContext.tsx
├── lib/                # Utilities and helpers
│   ├── api.ts          # API client
│   ├── utils.ts        # Utility functions
│   ├── redFlagRules.ts
│   ├── salaryData.ts
│   └── pdfGenerator.ts
├── hooks/              # Custom React hooks
│   └── use-toast.ts
├── App.tsx             # Main app component
├── main.tsx            # Application entry point
└── index.css           # Global styles
```

## Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **UI Components**: Shadcn/ui
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **State Management**: React Context API
- **Form Handling**: React Hook Form (if used)
- **PDF Generation**: jsPDF
- **Icons**: Lucide React

## Key Components

### FileUpload
Handles file uploads (PDF and images) with drag-and-drop support.

```tsx
<FileUpload onFileSelect={handleFileSelect} />
```

### SalaryMeter
Visual representation of salary comparison against market benchmarks.

```tsx
<SalaryMeter 
  offered={25} 
  min={18} 
  avg={22} 
  max={30} 
  comparison="above"
/>
```

### RedFlagTag
Displays detected red flags with severity indicators.

```tsx
<RedFlagTag 
  flag={redFlag} 
  severity="high"
/>
```

### ProgressSteps
Shows the current step in the analysis workflow.

```tsx
<ProgressSteps currentStep={2} />
```

## API Integration

The frontend communicates with the backend API using Axios. The API client is configured in `src/lib/api.ts`.

### Example API Call

```typescript
import { api } from '@/lib/api';

// Analyze offer
const response = await api.post('/analyze', {
  offerText: 'Your offer letter text...',
  role: 'Software Engineer',
  experience: '3-5 years',
  ctc: 25,
  city: 'Bangalore'
});

// Extract text from file
const formData = new FormData();
formData.append('file', file);
const extractResponse = await api.post('/extract-text', formData);
```

### Error Handling

The API client includes automatic error handling and retry logic:

```typescript
try {
  const response = await api.post('/analyze', data);
  // Handle success
} catch (error) {
  if (error.response?.status === 429) {
    // Rate limit exceeded
  } else if (error.response?.status === 503) {
    // Service unavailable
  } else {
    // Other errors
  }
}
```

## Environment Variables

All environment variables must be prefixed with `VITE_` to be accessible in the application.

### Available Variables

- `VITE_API_URL` - Backend API base URL (required)
- `VITE_ENABLE_FORUM` - Enable feedback forum feature (optional, default: false)
- `VITE_ENABLE_ANALYTICS` - Enable analytics tracking (optional, default: false)

### Environment-Specific Configuration

**Development:**
```env
VITE_API_URL=http://localhost:3001/api/v1
```

**Staging:**
```env
VITE_API_URL=https://staging-api.railway.app/api/v1
```

**Production:**
```env
VITE_API_URL=https://api.offerlens.com/api/v1
```

## Deployment

### Deploy to Vercel (Recommended)

1. **Sign up at [Vercel](https://vercel.com)**

2. **Import GitHub repository**
   - Click "New Project"
   - Select your GitHub repository
   - Vercel auto-detects Vite configuration

3. **Configure build settings**
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Set environment variables**
   ```
   VITE_API_URL=https://your-backend-url.railway.app/api/v1
   ```

5. **Deploy**
   - Click "Deploy"
   - Vercel builds and deploys automatically
   - Get your production URL

### Deploy to Other Platforms

**Netlify:**
```bash
npm run build
netlify deploy --prod --dir=dist
```

**AWS S3 + CloudFront:**
```bash
npm run build
aws s3 sync dist/ s3://your-bucket-name
```

**DigitalOcean App Platform:**
- Connect GitHub repository
- Set build command: `npm run build`
- Set output directory: `dist`

📖 **Detailed guide**: [Cloud Deployment Guide](../CLOUD_DEPLOYMENT_GUIDE.md)

## Development Workflow

### 1. Start Backend
```bash
cd ../offerlens-backend
npm run dev
```

### 2. Start Frontend
```bash
npm run dev
```

### 3. Make Changes
- Edit files in `src/`
- Vite hot-reloads automatically
- Check browser at `http://localhost:5173`

### 4. Test Changes
- Test in browser
- Check console for errors
- Test API integration

### 5. Build for Production
```bash
npm run build
npm run preview  # Preview production build
```

## Troubleshooting

### Port Already in Use

**Error**: `Port 5173 is already in use`

**Solution**:
```bash
# Kill process using port 5173
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :5173
kill -9 <PID>
```

Or change the port in `vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    port: 5174,
  },
});
```

### API Connection Failed

**Error**: `Network Error` or `CORS Error`

**Solution**:
1. Verify backend is running at the URL specified in `VITE_API_URL`
2. Check CORS configuration in backend `.env`:
   ```env
   CORS_ORIGIN=http://localhost:5173
   ```
3. Restart both frontend and backend servers

### Build Errors

**Error**: `Module not found` or `Cannot resolve module`

**Solution**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
```

### Environment Variables Not Loading

**Error**: Variables are `undefined`

**Solution**:
1. Ensure `.env` file exists in the root directory
2. Restart development server after changing `.env`
3. Verify variables are prefixed with `VITE_`
4. Check for typos in variable names

## Performance Optimization

### Code Splitting

Vite automatically code-splits by route:

```typescript
// Lazy load pages
const Results = lazy(() => import('./pages/Results'));
const Forum = lazy(() => import('./pages/Forum'));
```

### Image Optimization

```typescript
// Use WebP format
<img src="/image.webp" alt="..." />

// Lazy load images
<img loading="lazy" src="..." alt="..." />
```

### Bundle Analysis

```bash
npm run build
npx vite-bundle-visualizer
```

## Accessibility

- ✅ Semantic HTML
- ✅ ARIA labels
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Color contrast compliance (WCAG AA)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Contributing

See the main [Contributing Guidelines](../CONTRIBUTING.md) for details.

### Frontend-Specific Guidelines

- Follow React best practices
- Use TypeScript for type safety
- Follow the existing component structure
- Use Shadcn/ui components when possible
- Write accessible components
- Test on multiple browsers

## Documentation

- [Frontend-Backend Integration](../FRONTEND_BACKEND_INTEGRATION.md) - API integration guide
- [Local Development Setup](../LOCAL_DEVELOPMENT.md) - Complete setup guide
- [Cloud Deployment Guide](../CLOUD_DEPLOYMENT_GUIDE.md) - Deployment instructions

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/offerlens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/offerlens/discussions)

## License

MIT
