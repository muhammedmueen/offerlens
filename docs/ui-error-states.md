# UI Error States - Visual Guide

## Overview
This document shows what users will see when different errors occur during offer analysis.

---

## 1. Rate Limit Error (Most Common)

### When It Happens
- Too many API requests in short time (>10 per minute)
- Daily quota exceeded
- Model-specific rate limits hit

### What User Sees

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              ┌──────────────────┐                     │
│              │    ⚠️  Icon      │                     │
│              │  (Red Circle)    │                     │
│              └──────────────────┘                     │
│                                                        │
│              Rate Limit Exceeded                       │
│                                                        │
│   API rate limit exceeded. Please wait a few          │
│   minutes and try again, or switch to a different     │
│   model.                                               │
│                                                        │
│   ┌────────────────────────────────────────────┐     │
│   │ 💡 Tips to avoid rate limits:              │     │
│   │                                             │     │
│   │ • Wait 2-3 minutes before trying again     │     │
│   │ • Switch to a different AI model           │     │
│   │   (e.g., gemini-flash-lite-latest)         │     │
│   │ • Use the model selector in the upload     │     │
│   │   form                                      │     │
│   └────────────────────────────────────────────┘     │
│                                                        │
│        ┌──────────────┐  ┌──────────────┐           │
│        │  Try Again   │  │ Change Model │           │
│        └──────────────┘  └──────────────┘           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### User Actions
1. **Try Again** - Returns to upload page to retry with same settings
2. **Change Model** - Returns to upload page (user can select different model)

### Expected Behavior
- Both buttons navigate to `/upload`
- Previous form data is lost (user needs to re-upload)
- Model selector is visible and ready to use
- Tips box helps user understand how to avoid the issue

---

## 2. Invalid Request Error

### When It Happens
- Model doesn't support requested features
- Invalid prompt format
- Schema validation errors
- Model name typo or unavailable model

### What User Sees

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              ┌──────────────────┐                     │
│              │    ⚠️  Icon      │                     │
│              │  (Red Circle)    │                     │
│              └──────────────────┘                     │
│                                                        │
│              Analysis Failed                           │
│                                                        │
│   The AI model encountered an error processing        │
│   your offer. Please try a different model.           │
│                                                        │
│                                                        │
│              ┌──────────────┐                         │
│              │  Try Again   │                         │
│              └──────────────┘                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### User Actions
1. **Try Again** - Returns to upload page

### Expected Behavior
- Single button (no special tips)
- User should try a different model
- Less urgent than rate limit error

---

## 3. AI Service Error

### When It Happens
- Internal Gemini API errors
- Network timeouts
- Unexpected service failures
- Temporary outages

### What User Sees

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              ┌──────────────────┐                     │
│              │    ⚠️  Icon      │                     │
│              │  (Red Circle)    │                     │
│              └──────────────────┘                     │
│                                                        │
│              Analysis Failed                           │
│                                                        │
│   The AI service encountered an internal error.       │
│   Please try again.                                    │
│                                                        │
│                                                        │
│              ┌──────────────┐                         │
│              │  Try Again   │                         │
│              └──────────────┘                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### User Actions
1. **Try Again** - Returns to upload page

### Expected Behavior
- Simple retry message
- Usually temporary issue
- Should work on retry

---

## 4. Generic Error (Fallback)

### When It Happens
- Unknown error type
- No specific error message
- Unexpected failures

### What User Sees

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              ┌──────────────────┐                     │
│              │    ⚠️  Icon      │                     │
│              │  (Red Circle)    │                     │
│              └──────────────────┘                     │
│                                                        │
│              Analysis Failed                           │
│                                                        │
│   Analysis failed. Please try again.                  │
│                                                        │
│                                                        │
│              ┌──────────────┐                         │
│              │  Try Again   │                         │
│              └──────────────┘                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### User Actions
1. **Try Again** - Returns to upload page

---

## 5. Processing (Normal State)

### What User Sees While Waiting

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              ┌──────────────────┐                     │
│              │   🔄 Spinner     │                     │
│              │   (Animated)     │                     │
│              └──────────────────┘                     │
│                                                        │
│           Analyzing your offer…                        │
│                                                        │
│   ┌────────────────────────────────────────────┐     │
│   │ ✓ Uploading                                │     │
│   └────────────────────────────────────────────┘     │
│   ┌────────────────────────────────────────────┐     │
│   │ ✓ Reading Document                         │     │
│   └────────────────────────────────────────────┘     │
│   ┌────────────────────────────────────────────┐     │
│   │ 🔄 Analyzing                               │     │
│   └────────────────────────────────────────────┘     │
│   ┌────────────────────────────────────────────┐     │
│   │ ○ Scoring                                  │     │
│   └────────────────────────────────────────────┘     │
│                                                        │
│         Usually takes 15–30 seconds                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Progress Indicators
- ✓ = Completed step (green checkmark)
- 🔄 = Current step (spinning loader)
- ○ = Pending step (empty circle)

### Time Messages
- 0-30s: "Usually takes 15–30 seconds"
- 30-60s: "Taking a bit longer than usual…"
- 60-300s: "Still working on it. We'll keep trying."
- 300+s: "Something went wrong." + [Try Again] buttons

---

## Design Specifications

### Colors
- **Error Icon Background**: `bg-destructive/10` (light red)
- **Error Icon**: `text-destructive` (red)
- **Card Background**: `skeu-card` (neumorphic card style)
- **Tips Box**: `bg-muted/50` with `skeu-inset` (inset neumorphic)
- **Primary Button**: `brand-gradient` (gradient background)
- **Secondary Button**: `skeu-emboss` (raised neumorphic)

### Typography
- **Heading**: `text-xl font-bold text-foreground`
- **Body**: `text-muted-foreground`
- **Tips Title**: `font-medium`
- **Tips List**: `text-sm text-muted-foreground`

### Spacing
- **Container**: `max-w-lg mx-auto px-4 py-24`
- **Card Padding**: `p-8`
- **Icon Size**: `h-16 w-16` container, `h-8 w-8` icon
- **Button Gap**: `gap-3`
- **Section Margins**: `mb-6`

### Icons
- **Error**: `AlertCircle` from lucide-react
- **Success**: `CheckCircle` from lucide-react
- **Loading**: `Loader2` from lucide-react (with spin animation)

---

## User Flow Examples

### Scenario 1: Rate Limit Hit
1. User uploads offer letter
2. Processing starts (shows spinner)
3. After 5-10 seconds, rate limit error occurs
4. UI switches to rate limit error state
5. User sees tips and "Change Model" button
6. User clicks "Change Model"
7. Returns to upload page
8. User selects "gemini-flash-lite-latest" from dropdown
9. Submits again
10. Processing succeeds

### Scenario 2: Temporary Service Error
1. User uploads offer letter
2. Processing starts
3. AI service has temporary outage
4. UI shows "AI Service Error"
5. User clicks "Try Again"
6. Returns to upload page
7. User re-uploads same file
8. Processing succeeds (service recovered)

### Scenario 3: Invalid Model
1. Developer tests with invalid model name
2. Processing starts
3. Invalid request error occurs
4. UI shows "Invalid Request Error"
5. Developer clicks "Try Again"
6. Selects valid model from dropdown
7. Processing succeeds

---

## Accessibility

### Screen Reader Support
- Error icon has `aria-label="Error"`
- Heading has proper hierarchy (h2)
- Buttons have descriptive text
- Tips list uses semantic `<ul>` element

### Keyboard Navigation
- All buttons are keyboard accessible
- Tab order is logical (heading → tips → buttons)
- Enter/Space activates buttons

### Color Contrast
- Error text meets WCAG AA standards
- Button text has sufficient contrast
- Tips text is readable

---

## Mobile Responsiveness

### Small Screens (<640px)
- Card takes full width with padding
- Buttons stack vertically
- Icon size remains consistent
- Text size adjusts for readability

### Medium Screens (640px-1024px)
- Card has max-width constraint
- Buttons remain horizontal
- Comfortable spacing

### Large Screens (>1024px)
- Card centered with max-width
- Optimal reading width maintained
- Generous whitespace

---

## Animation & Transitions

### Loading State
- Spinner rotates continuously (`animate-spin`)
- Steps fade in as they complete
- Smooth transitions between states

### Error State
- Error card fades in
- Icon appears with subtle scale animation
- Buttons have hover effects

### Button Interactions
- Hover: Slight opacity change
- Active: Scale down slightly
- Focus: Visible outline for accessibility

---

## Testing Checklist

- [ ] Rate limit error displays correctly
- [ ] Tips box shows for rate limit errors only
- [ ] "Change Model" button appears for rate limit errors
- [ ] Invalid request error displays correctly
- [ ] AI service error displays correctly
- [ ] Generic error displays correctly
- [ ] All buttons navigate to correct pages
- [ ] Error messages are clear and actionable
- [ ] Mobile layout works correctly
- [ ] Keyboard navigation works
- [ ] Screen reader announces errors
- [ ] Colors have sufficient contrast
