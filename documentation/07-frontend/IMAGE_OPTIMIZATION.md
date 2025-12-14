# Image Optimization Guide

This guide explains how to use Next.js Image component for optimal performance.

## Why Use Next.js Image Component?

The Next.js Image component provides automatic image optimization:

- **Automatic format conversion**: Serves WebP/AVIF when supported
- **Responsive sizing**: Generates multiple sizes for different devices
- **Lazy loading**: Images load only when entering viewport
- **Blur placeholder**: Shows blur-up effect while loading
- **No layout shift**: Reserves space to prevent CLS

## Basic Usage

### Import the Component

```typescript
import Image from 'next/image'
```

### Static Images (Local Files)

For images in the `public` folder:

```tsx
import Image from 'next/image'

export function MyComponent() {
  return (
    <Image
      src="/images/hero.jpg"
      alt="Hero image description"
      width={1200}
      height={630}
      priority // Use for above-the-fold images
    />
  )
}
```

### Remote Images

For external images, configure domains in `next.config.mjs`:

```javascript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'example.com',
    },
  ],
}
```

Then use:

```tsx
<Image
  src="https://example.com/image.jpg"
  alt="Remote image"
  width={800}
  height={600}
/>
```

### Responsive Images

Use `fill` for responsive containers:

```tsx
<div className="relative w-full h-64">
  <Image
    src="/images/banner.jpg"
    alt="Banner"
    fill
    className="object-cover"
  />
</div>
```

## Common Patterns

### Hero Images

```tsx
<div className="relative h-screen w-full">
  <Image
    src="/images/hero.jpg"
    alt="Hero background"
    fill
    priority
    className="object-cover"
    quality={90}
  />
</div>
```

### Avatar Images

```tsx
<div className="relative h-12 w-12 rounded-full overflow-hidden">
  <Image
    src="/images/avatar.jpg"
    alt="User avatar"
    fill
    className="object-cover"
  />
</div>
```

### Card Images

```tsx
<div className="relative aspect-video w-full">
  <Image
    src="/images/card.jpg"
    alt="Card image"
    fill
    className="object-cover rounded-lg"
  />
</div>
```

### Logo Images

```tsx
<Image
  src="/logo.svg"
  alt="Company logo"
  width={120}
  height={40}
  priority
/>
```

## Image Optimization Props

### Required Props

- `src`: Image source (string or imported image)
- `alt`: Alternative text for accessibility
- `width` & `height`: Dimensions (or use `fill`)

### Optional Props

- `priority`: Load image immediately (for above-fold)
- `quality`: Image quality (1-100, default 75)
- `placeholder`: Show blur placeholder ('blur' or 'empty')
- `blurDataURL`: Custom blur placeholder
- `fill`: Fill parent container (responsive)
- `sizes`: Responsive sizes for different breakpoints
- `loading`: Loading behavior ('lazy' or 'eager')
- `className`: CSS classes
- `style`: Inline styles

## Responsive Sizes

Use `sizes` prop for responsive images:

```tsx
<Image
  src="/images/responsive.jpg"
  alt="Responsive image"
  fill
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

This tells the browser:
- Mobile (≤768px): Use 100% viewport width
- Tablet (≤1200px): Use 50% viewport width
- Desktop (>1200px): Use 33% viewport width

## Blur Placeholder

### Automatic Blur (Static Images)

```tsx
import heroImage from '@/public/images/hero.jpg'

<Image
  src={heroImage}
  alt="Hero"
  placeholder="blur"
/>
```

### Custom Blur (Remote Images)

```tsx
<Image
  src="https://example.com/image.jpg"
  alt="Remote image"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..."
/>
```

Generate blur data URL:
```bash
# Using plaiceholder library
npm install plaiceholder
```

## Performance Best Practices

### 1. Use Priority for Above-the-Fold Images

```tsx
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority // Loads immediately
/>
```

### 2. Lazy Load Below-the-Fold Images

```tsx
<Image
  src="/content.jpg"
  alt="Content"
  width={800}
  height={600}
  loading="lazy" // Default behavior
/>
```

### 3. Optimize Quality

```tsx
// High quality for hero images
<Image src="/hero.jpg" quality={90} />

// Lower quality for thumbnails
<Image src="/thumb.jpg" quality={60} />
```

### 4. Use Appropriate Formats

The Image component automatically serves:
- AVIF (best compression, modern browsers)
- WebP (good compression, wide support)
- Original format (fallback)

### 5. Specify Sizes for Responsive Images

```tsx
<Image
  src="/responsive.jpg"
  fill
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
/>
```

## Common Mistakes to Avoid

### ❌ Don't Use Regular `<img>` Tags

```tsx
// Bad
<img src="/image.jpg" alt="Image" />

// Good
<Image src="/image.jpg" alt="Image" width={800} height={600} />
```

### ❌ Don't Forget Alt Text

```tsx
// Bad
<Image src="/image.jpg" width={800} height={600} />

// Good
<Image src="/image.jpg" alt="Descriptive text" width={800} height={600} />
```

### ❌ Don't Use Priority on All Images

```tsx
// Bad - slows down initial load
<Image src="/image1.jpg" priority />
<Image src="/image2.jpg" priority />
<Image src="/image3.jpg" priority />

// Good - only above-the-fold
<Image src="/hero.jpg" priority />
<Image src="/content1.jpg" />
<Image src="/content2.jpg" />
```

### ❌ Don't Forget Width/Height or Fill

```tsx
// Bad - causes layout shift
<Image src="/image.jpg" alt="Image" />

// Good
<Image src="/image.jpg" alt="Image" width={800} height={600} />

// Or use fill
<div className="relative h-64">
  <Image src="/image.jpg" alt="Image" fill />
</div>
```

## Configuration

Current configuration in `next.config.mjs`:

```javascript
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "**",
    },
  ],
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
}
```

## Testing Image Optimization

### 1. Check Network Tab

Open DevTools → Network → Img filter
- Verify WebP/AVIF format is served
- Check image sizes match viewport
- Confirm lazy loading works

### 2. Lighthouse Audit

Run Lighthouse to check:
- Properly sized images
- Next-gen formats
- Lazy loading
- No layout shift

### 3. Core Web Vitals

Monitor:
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)

## Migration Checklist

When adding images to the application:

- [ ] Use `next/image` instead of `<img>`
- [ ] Provide `alt` text for accessibility
- [ ] Specify `width` and `height` or use `fill`
- [ ] Add `priority` for above-the-fold images
- [ ] Use `placeholder="blur"` for better UX
- [ ] Configure `sizes` for responsive images
- [ ] Test on different devices and screen sizes
- [ ] Verify in Lighthouse audit

## Resources

- [Next.js Image Documentation](https://nextjs.org/docs/app/api-reference/components/image)
- [Image Optimization Guide](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [Web.dev Image Optimization](https://web.dev/fast/#optimize-your-images)
