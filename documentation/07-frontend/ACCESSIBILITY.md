# Accessibility Implementation

This document outlines the accessibility features implemented in the OfferLens Next.js frontend to ensure WCAG 2.1 AA compliance.

## Requirements Coverage

### Requirement 10.1: Keyboard Navigation Support

**Implementation:**
- All interactive elements (buttons, links, inputs) are keyboard accessible
- Visible focus indicators on all focusable elements using CSS `:focus-visible`
- Focus ring styling defined in `globals.css`:
  - 2px solid outline with 2px offset
  - Primary color for standard elements
  - Destructive color for error states
- Tab order follows logical document flow
- No keyboard traps

**CSS Implementation:**
```css
*:focus-visible {
  outline: var(--focus-visible-outline);
  outline-offset: var(--focus-visible-offset);
}
```

**Testing:**
- Navigate through all pages using Tab key
- Verify focus indicators are visible
- Test form submission with Enter key
- Test button activation with Space/Enter

### Requirement 10.2: ARIA Labels and Descriptions

**Implementation:**
- Semantic HTML5 elements used throughout (`<nav>`, `<main>`, `<header>`, `<footer>`)
- ARIA labels added to:
  - Navigation regions (`aria-label="Main navigation"`)
  - Interactive buttons (`aria-label="Open menu"`, `aria-expanded`)
  - Form inputs (`aria-label`, `aria-describedby`)
  - Status indicators (`role="status"`, `role="alert"`)
  - Regions (`role="region"`, `aria-label`)

**Key Components:**
- **Navbar**: `role="banner"`, `aria-label="Main navigation"`
- **Footer**: `role="contentinfo"`, `aria-label="Site footer"`
- **Red Flag Cards**: `role="alert"`, `aria-label` for severity
- **Salary Comparison**: `role="region"`, `aria-label` for visualization
- **Mobile Menu**: `aria-hidden` when closed, `aria-expanded` on toggle

**Screen Reader Support:**
- `.sr-only` utility class for screen reader-only content
- Decorative icons marked with `aria-hidden="true"`
- Meaningful labels for all interactive elements

### Requirement 10.3: Skip Link to Main Content

**Implementation:**
- Skip link added to navbar component
- Positioned off-screen by default
- Becomes visible on keyboard focus
- Links to `#main-content` ID on all pages
- Styled with high contrast for visibility

**CSS:**
```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 1rem;
  z-index: 100;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
}

.skip-link:focus {
  top: 1rem;
}
```

**Pages with Skip Link:**
- Home page (`/`)
- Upload page (`/upload`)
- Results page (`/results`)
- Forum page (`/forum`)
- Feature Request page (`/feature-request`)

### Requirement 10.4: Image Alt Text

**Implementation:**
- All images use Next.js Image component with required `alt` prop
- Decorative images use empty alt text (`alt=""`) or `aria-hidden="true"`
- Icons in UI components marked as decorative with `aria-hidden="true"`
- Meaningful alt text for content images

**Guidelines:**
- Content images: Descriptive alt text
- Decorative images: `alt=""` or `aria-hidden="true"`
- Icons with adjacent text: `aria-hidden="true"`
- Icons without text: Descriptive `aria-label`

### Requirement 10.5: Non-Color Indicators for Color-Coded Information

**Implementation:**

#### Red Flag Severity Indicators
- **Color**: Border and background colors (red, yellow, blue)
- **Icon**: Different icons for each severity (AlertTriangle, AlertCircle, Info)
- **Text Badge**: "High Risk", "Medium Risk", "Low Risk"
- **ARIA Label**: Descriptive labels for screen readers

```typescript
const severityConfig = {
  destructive: {
    icon: AlertTriangle,
    badge: "High Risk",
    ariaLabel: "High severity red flag"
  },
  warning: {
    icon: AlertCircle,
    badge: "Medium Risk",
    ariaLabel: "Medium severity red flag"
  },
  caution: {
    icon: Info,
    badge: "Low Risk",
    ariaLabel: "Low severity red flag"
  }
}
```

#### Salary Comparison Status
- **Color**: Text color (red, green, blue)
- **Icon**: Directional indicators (↓ below, ↑ above, • within)
- **Text**: "Below Market", "Within Market", "Above Market"
- **ARIA Label**: Status description for screen readers

```typescript
const statusIcon = isBelow ? "↓" : isAbove ? "↑" : "•"
```

## Accessibility Testing Checklist

### Keyboard Navigation
- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible on all focusable elements
- [ ] Tab order is logical and follows visual flow
- [ ] No keyboard traps exist
- [ ] Skip link works and is visible on focus
- [ ] Modal dialogs trap focus appropriately
- [ ] Escape key closes modals and dropdowns

### Screen Reader Testing
- [ ] Page structure is logical with proper headings
- [ ] All images have appropriate alt text
- [ ] Form inputs have associated labels
- [ ] Error messages are announced
- [ ] Dynamic content updates are announced
- [ ] ARIA labels are descriptive and accurate
- [ ] Navigation landmarks are properly labeled

### Visual Testing
- [ ] Focus indicators have sufficient contrast (3:1 minimum)
- [ ] Text has sufficient contrast (4.5:1 for normal, 3:1 for large)
- [ ] Color is not the only means of conveying information
- [ ] UI is usable at 200% zoom
- [ ] No horizontal scrolling at standard viewport sizes

### Mobile Accessibility
- [ ] Touch targets are at least 44x44 pixels
- [ ] Pinch-to-zoom is enabled
- [ ] Content reflows properly on small screens
- [ ] No content is hidden or inaccessible on mobile

## Tools for Testing

### Automated Testing
- **axe DevTools**: Browser extension for automated accessibility testing
- **Lighthouse**: Built into Chrome DevTools, includes accessibility audit
- **WAVE**: Web accessibility evaluation tool

### Manual Testing
- **Keyboard Only**: Navigate entire site using only keyboard
- **Screen Reader**: Test with NVDA (Windows), JAWS (Windows), or VoiceOver (Mac)
- **Zoom**: Test at 200% browser zoom
- **Color Blindness**: Use browser extensions to simulate color blindness

### Browser Extensions
- **axe DevTools**: https://www.deque.com/axe/devtools/
- **WAVE**: https://wave.webaim.org/extension/
- **Accessibility Insights**: https://accessibilityinsights.io/

## Known Issues and Future Improvements

### Current Limitations
- None identified at this time

### Future Enhancements
- Add more comprehensive ARIA live regions for dynamic content
- Implement focus management for client-side navigation
- Add keyboard shortcuts for power users
- Enhance mobile screen reader experience
- Add high contrast mode support

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Resources](https://webaim.org/resources/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)

## Compliance Statement

This application strives to meet WCAG 2.1 Level AA standards. All features have been implemented with accessibility in mind, including:

- Keyboard navigation support
- Screen reader compatibility
- Sufficient color contrast
- Responsive and mobile-friendly design
- Clear focus indicators
- Semantic HTML structure
- ARIA labels and descriptions
- Non-color indicators for important information

For accessibility issues or questions, please contact the development team.
