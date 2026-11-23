---
name: liquid-glass-design
description: "Apple Liquid Glass design system: dynamic glass material with blur, reflection, refraction, and interactive morphing for SwiftUI, UIKit, WidgetKit, and Web/Next.js/Tailwind CSS. Use when building or refactoring Liquid Glass UI components."
---

# Liquid Glass Design System

Patterns for implementing Apple-style **Liquid Glass** — a dynamic material that blurs content behind it, reflects color and light from surrounding content, and reacts to touch and pointer interactions. Covers native Apple frameworks (SwiftUI, UIKit, WidgetKit) and Web/Next.js/Tailwind CSS implementations.

## When to Activate

- Building or updating apps with the Apple-style Liquid Glass design language
- Implementing glass-style buttons, cards, toolbars, navigation docks, or containers
- Creating morphing transitions between glass elements
- Applying Liquid Glass effects to widgets and web components
- Migrating existing flat or standard blur/material effects to the Liquid Glass API

---

## Core Pattern — SwiftUI

### Basic Glass Effect
The simplest way to add Liquid Glass to any view:
```swift
Text("Hello, World!")
    .font(.title)
    .padding()
    .glassEffect()  // Default: regular variant, capsule shape
```

### Customizing Shape and Tint
```swift
Text("Hello, World!")
    .font(.title)
    .padding()
    .glassEffect(.regular.tint(.orange).interactive(), in: .rect(cornerRadius: 16.0))
```

Key customization options:
- `.regular` — Standard glass effect
- `.tint(Color)` — Add color tint for prominence (e.g. azure, emerald, obsidian)
- `.interactive()` — React to touch and pointer interactions
- Shape: `.capsule` (default), `.rect(cornerRadius:)`, `.circle`

### Glass Button Styles
```swift
Button("Click Me") { /* action */ }
    .buttonStyle(.glass)

Button("Important") { /* action */ }
    .buttonStyle(.glassProminent)
```

### GlassEffectContainer for Multiple Elements
Always wrap multiple glass views in a container for performance and morphing:
```swift
GlassEffectContainer(spacing: 40.0) {
    HStack(spacing: 40.0) {
        Image(systemName: "scribble.variable")
            .frame(width: 80.0, height: 80.0)
            .font(.system(size: 36))
            .glassEffect()

        Image(systemName: "eraser.fill")
            .frame(width: 80.0, height: 80.0)
            .font(.system(size: 36))
            .glassEffect()
    }
}
```
The `spacing` parameter controls merge distance — closer elements blend their glass shapes together.

---

## Core Pattern — Web / Next.js / Tailwind CSS

When translating the Liquid Glass design system to Web applications (React, Next.js, Tailwind CSS), apply the same 3-layer mental model:

### 1. Ambient Background Layer (Canvas)
Glass requires rich chromatic light behind it to refract realistically. Without colorful background elements or ambient glows, glass appears flat gray:
```html
<div class="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
  <div class="absolute -top-24 -left-20 w-96 h-96 rounded-full bg-blue-500/15 blur-3xl" />
  <div class="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
</div>
```

### 2. Optical Glass Formula (CSS Tokens)
```css
/* Standard Liquid Glass */
.liquid-glass {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 
    0 12px 36px -8px rgba(0, 0, 0, 0.08),
    inset 0 1px 1.5px rgba(255, 255, 255, 0.9),
    inset 0 -1px 1px rgba(0, 0, 0, 0.04);
}

/* Dark Mode / Obsidian Tint */
.dark .liquid-glass {
  background: rgba(18, 24, 38, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 
    0 16px 40px -10px rgba(0, 0, 0, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.25);
}

/* Prominent / Interactive Pill Buttons */
.liquid-glass-btn-primary {
  background: linear-gradient(135deg, #0071e3 0%, #005bb5 100%);
  box-shadow: 
    0 8px 24px -4px rgba(0, 113, 227, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.5);
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease;
}
.liquid-glass-btn-primary:active {
  transform: scale(0.98);
}
```

---

## Best Practices & Anti-Patterns

### Best Practices
- **Hierarchy & Restraint**: Liquid Glass is an overlay material meant to establish functional hierarchy above content. Reserve it for floating navigation bars, modal cards, docks, and interactive controls.
- **Shared Blur Context**: Group adjacent buttons/pills inside a common container instead of stacking independent heavy blurs.
- **Specular Rim Highlights**: Always use an inner highlight (`inset 0 1px 1.5px rgba(255,255,255,...)`) to simulate physical glass bevel thickness and light catching the top rim.
- **Interactive Feedback**: Only apply interactive spring-press states (`:active { transform: scale(0.98); }`) to elements that actually trigger actions.
- **Accessibility Contrast**: Never sacrifice text contrast for transparency. Text on glass must meet WCAG AA standards (high-contrast neutral text or dark mode inversion).

### Anti-Patterns to Avoid
- **Never nest glass on glass**: Stacking multiple semi-transparent blur surfaces causes "milky mud" and degrades frame rate.
- **Never use opaque backgrounds behind glass**: Pure flat `#ffffff` or `#000000` behind glass eliminates the refactive optical effect.
- **Do not apply glass to full screen bodies**: Body background should remain canvas/content, allowing floating glass layers to maintain depth.
- **Do not use heavy saturated borders**: Hairline borders (`border-white/20` or `1px solid rgba(255,255,255,0.35)`) look like authentic glass; thick colored borders look like plastic.
