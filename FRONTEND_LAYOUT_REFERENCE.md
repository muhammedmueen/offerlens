# OfferLens Frontend Layout Reference

This document outlines the structural layout of all pages in the OfferLens application. Use this as a reference for recreating the UI with AI tools.

---

## Global Components

### Navigation Bar (Nav)
- **Position**: Fixed at top, full width
- **Height**: 56px (mobile) / 64px (desktop)
- **Background**: Semi-transparent with backdrop blur
- **Layout**: Horizontal flex container
  - Left: Logo (icon + "OfferLens" text)
  - Right: Action buttons + Theme toggle
- **Border**: Bottom border

### Footer
- **Position**: Bottom of page
- **Layout**: Horizontal flex container
  - Left: Copyright text
  - Right: Links (Forum, Feedback)
- **Border**: Top border

---

## Page 1: Home Page (`/`)

### Structure Overview
1. Navigation Bar
2. Hero Section
3. Features Section
4. How It Works Section
5. FAQ Section
6. Bottom CTA Section
7. Footer

### Detailed Layout

#### Hero Section
- **Container**: Centered, max-width 768px
- **Background**: Gradient blur circles (decorative)
- **Elements** (top to bottom):
  1. **Badge**: Pill-shaped, icon + text ("Rule-based analysis • No AI guessing")
  2. **Main Heading**: Large text with highlighted portion
  3. **Tagline**: Subtitle text
  4. **CTA Buttons**: Two buttons side-by-side (mobile: stacked)
     - Primary: "Start Analysis" with arrow icon
     - Secondary: "Try with Sample" with play icon

#### Features Section
- **Background**: Light secondary color
- **Layout**: 3-column grid (mobile: 1 column)
- **Each Feature Card**:
  - Icon container (rounded square with background)
  - Title
  - Description text

#### How It Works Section
- **Container**: Centered, max-width 896px
- **Header**: Title + subtitle (centered)
- **Layout**: 3-column grid (mobile: 1 column)
- **Each Step**:
  - Numbered circle badge
  - Step title
  - Description text

#### FAQ Section
- **Container**: Centered, max-width 672px
- **Header**: Title + subtitle (centered)
- **Layout**: Accordion list
- **Each FAQ Item**:
  - Question (expandable trigger)
  - Answer (collapsible content)

#### Bottom CTA Section
- **Background**: Light secondary color
- **Layout**: Centered content
  - Heading
  - Subtitle
  - CTA button

---

## Page 2: Upload Page (`/upload`)

### Structure Overview
1. Navigation Bar
2. Back Link
3. Progress Steps
4. Page Title
5. Demo Banner (conditional)
6. Form Sections
7. Submit Button

### Detailed Layout

#### Progress Steps
- **Layout**: Horizontal stepper (3 steps)
- **Each Step**:
  - Circle with number/checkmark
  - Label below
  - Connecting line between steps

#### Form Sections (vertical stack)

1. **File Upload Card**
   - Header: "Upload Offer Letter"
   - File upload component (drag & drop area)

2. **Text Input Card**
   - Header: "Or Paste Offer Text"
   - Large textarea
   - Character count/info text

3. **Details Form Card**
   - Header: "Offer Details"
   - **Fields** (vertical stack):
     - Role (dropdown select)
     - Experience (dropdown select)
     - Location (dropdown select)
     - CTC (number input with LPA label)

4. **Submit Button**
   - Full-width primary button
   - "Analyze Offer" text with arrow icon

---

## Page 3: Results Page (`/results`)

### Structure Overview
1. Navigation Bar (with action buttons)
2. Progress Steps
3. Page Title with Success Icon
4. Results Cards (vertical stack)
5. Footer

### Detailed Layout

#### Page Title Section
- **Layout**: Centered
- **Elements**:
  - Success icon (large, circular background)
  - "Analysis Complete" heading
  - Offer details subtitle (role • experience • city • CTC)

#### Results Cards (vertical stack)

1. **Offer Summary Card**
   - Header: "Extracted Offer Summary" with icon
   - Scrollable text area with offer content

2. **Red Flag Scanner Card**
   - Header: "Red Flag Scanner" with icon
   - **Content**: List of red flag tags OR success message
   - **Each Red Flag Tag**:
     - Severity icon
     - Title + severity badge
     - Description text

3. **Market Salary Comparison Card**
   - Header: "Market Salary Comparison" with icon
   - **Content**:
     - 3-column grid (Min, Avg, Max values)
     - Visual scale bar with markers
     - Comparison result box with icon + message

4. **Take-Home Salary Card**
   - Header: "Estimated Take-Home Salary" with icon
   - **Content** (centered):
     - Emoji icon
     - Label text
     - Large formatted currency amount
     - Disclaimer text

5. **Negotiation Blueprint Card**
   - Header: "Negotiation Blueprint" with icon
   - **Content**: List of negotiation cards
   - **Each Negotiation Card**:
     - Left border (color-coded by priority)
     - Icon emoji
     - Title + priority badge + category badge
     - Suggestion text

6. **Analyze Another Button**
   - Full-width secondary button

---

## Page 4: Forum Page (`/forum`)

### Structure Overview
1. Navigation Bar
2. Back Link
3. Page Header
4. Feedback Forum Component
5. Footer

### Detailed Layout

#### Page Header
- **Layout**: Horizontal flex (mobile: vertical)
- **Left Side**:
  - Icon container (large, rounded)
  - Title + subtitle
- **Right Side** (desktop only):
  - "Submit Request" button
- **Mobile**: Full-width button below

#### Feedback Forum Component
- **Layout**: Vertical list of feature request cards
- **Each Card**:
  - Vote button (left side, vertical)
  - Content area:
    - Title
    - Description
    - Status badge
    - Category badge
    - Metadata (author, date)

---

## Page 5: Feature Request Page (`/feature-request`)

### Structure Overview
1. Navigation Bar
2. Back Link
3. Page Header (centered)
4. Feature Request Form Card
5. Footer

### Detailed Layout

#### Page Header
- **Layout**: Centered
- **Elements**:
  - Icon container (large, rounded)
  - Title
  - Subtitle

#### Feature Request Form Card
- **Layout**: Single card with form fields
- **Fields** (vertical stack):
  - Type selector (radio buttons or tabs)
  - Title input
  - Description textarea
  - Email input (optional)
  - Submit button

---

## Page 6: Not Found Page (`/404`)

### Structure Overview
1. Simple Header (logo only)
2. Centered Content
3. No footer

### Detailed Layout

#### Centered Content
- **Layout**: Vertically and horizontally centered
- **Elements** (vertical stack):
  - Large "404" text
  - "Page Not Found" heading
  - Description text
  - "Back to Home" button

---

## Common UI Patterns

### Card Component (FloatingCard)
- Rounded corners (large radius)
- Padding: 16-24px
- Background: Card color
- Optional shadow/border
- **Header** (if present):
  - Icon container + title (horizontal flex)
  - Margin bottom before content

### Button Variants
1. **Hero**: Primary color, large, with icon
2. **Outline**: Border only, transparent background
3. **Soft**: Light background, subtle
4. **Ghost**: No background, minimal

### Input Fields
- Height: 48px
- Rounded corners
- Border with focus state
- Placeholder text
- Background: Secondary color

### Responsive Breakpoints
- Mobile: < 640px (sm)
- Tablet: 640px - 768px (md)
- Desktop: > 768px (lg)

### Spacing Scale
- Gap between cards: 16-24px
- Section padding: 64-80px (vertical)
- Container padding: 16-24px (horizontal)
- Max content width: 672-896px (varies by page)

### Animation Patterns
- Fade in: Opacity 0 → 1
- Fade in up: Opacity 0 → 1 + translate Y
- Scale in: Scale 0.95 → 1
- Staggered delays: 100ms increments

### Color Semantics
- **Primary**: Brand color, CTAs
- **Secondary**: Backgrounds, subtle elements
- **Success**: Positive states, aligned salary
- **Destructive**: High risk, below market
- **Warning**: Medium risk
- **Caution**: Low risk
- **Muted**: Disabled, secondary text

---

## Layout Grid System

### Container
- Max width: Varies by page (672px - 1280px)
- Horizontal padding: 16px (mobile) / 24px (desktop)
- Centered with auto margins

### Grid Patterns
1. **3-Column**: Features, steps, salary metrics
2. **2-Column**: Form fields (desktop)
3. **1-Column**: Mobile default, form sections

### Flex Patterns
1. **Space Between**: Nav, footer
2. **Centered**: Hero content, page headers
3. **Gap**: Button groups, badges

---

## Typography Hierarchy

### Headings
- **H1**: 32-48px (page titles)
- **H2**: 24-32px (section titles)
- **H3**: 18-24px (card headers)
- **H4**: 16-18px (sub-headers)

### Body Text
- **Base**: 14-16px
- **Small**: 12-14px
- **Large**: 16-20px

### Font Weights
- **Bold**: 700 (headings)
- **Semibold**: 600 (sub-headers)
- **Medium**: 500 (labels)
- **Regular**: 400 (body)

---

## Icon Usage

### Icon Sizes
- Small: 16px
- Medium: 20px
- Large: 24px
- XLarge: 32px

### Icon Placement
- **Left of text**: Buttons, links
- **Above text**: Feature cards, steps
- **Inline**: Badges, tags
- **Standalone**: Status indicators

---

## State Indicators

### Loading States
- Spinner/skeleton
- Disabled buttons
- Loading text

### Success States
- Checkmark icons
- Green/success colors
- Confirmation messages

### Error States
- Alert icons
- Red/destructive colors
- Error messages

### Empty States
- Placeholder text
- Call-to-action
- Helpful instructions

---

## Accessibility Considerations

### Touch Targets
- Minimum height: 44px (mobile)
- Adequate spacing between interactive elements

### Focus States
- Visible focus rings
- Keyboard navigation support

### Color Contrast
- Text meets WCAG AA standards
- Interactive elements clearly distinguishable

### Semantic HTML
- Proper heading hierarchy
- Form labels
- ARIA attributes where needed

---

## Notes for AI Recreation

1. **Maintain consistent spacing** using the defined scale
2. **Use semantic color names** (primary, success, destructive) rather than specific hex values
3. **Implement responsive behavior** at defined breakpoints
4. **Add animations** with staggered delays for visual polish
5. **Ensure touch-friendly** sizing on mobile devices
6. **Keep content hierarchy** clear with proper typography
7. **Use flex/grid** for layouts rather than absolute positioning
8. **Implement proper states** (hover, focus, active, disabled)
9. **Add loading states** for async operations
10. **Include error handling** UI for all user inputs

---

**Version**: 1.0  
**Last Updated**: December 2024  
**Purpose**: Reference for AI-assisted UI recreation
