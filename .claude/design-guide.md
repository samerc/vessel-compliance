# Vessel Compliance — UI Design Standard

> **Purpose**: Reference for all new and existing components. Every UI element should follow these patterns exactly. Deviations require explicit justification.

---

## 1. CSS Variables (Theme Tokens)

Always use CSS variables — never hardcode colors for themeable surfaces.

| Variable | Dark | Light | Usage |
|---|---|---|---|
| `--bg-dark` | `#0f1218` | `#f0f2f5` | Page background |
| `--bg-card` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.7)` | Card/section surface |
| `--bg-card-hover` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.9)` | Card hover state |
| `--bg-sidebar` | `rgba(0,0,0,0.4)` | `#ffffff` | Sidebar background |
| `--accent-primary` | `#00d2ff` | `#1a73e8` | CTA, focus ring, icons |
| `--accent-secondary` | `#3a7bd5` | `#0d47a1` | Gradient pair |
| `--text-primary` | `#ffffff` | `#1c1e21` | Body text, labels |
| `--text-secondary` | `rgba(255,255,255,0.6)` | `#606770` | Hints, metadata |
| `--input-bg` | `rgba(255,255,255,0.05)` | `#ffffff` | Input backgrounds |
| `--input-border` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.15)` | Input default border |
| `--table-header-bg` | `rgba(255,255,255,0.02)` | `rgba(0,0,0,0.02)` | Table header fill |
| `--table-border` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.1)` | Table row dividers |
| `--glass-border` | `1px solid rgba(255,255,255,0.1)` | `1px solid rgba(0,0,0,0.1)` | Card/modal borders |
| `--danger` | `#ff4d4d` | `#ff4d4d` | Destructive actions |
| `--success` | `#00ff88` | `#00ff88` | Positive feedback |
| `--warning` | `#ffcc00` | `#ffcc00` | Caution/alerts |

**Hardcoded exceptions** (theme-invariant structural colors, in styled constants only):
- Modals: `background: isLight ? '#ffffff' : '#1a1d28'`
- Sticky table header: `background: isLight ? '#eef0f3' : '#181b24'`

---

## 2. Buttons

### 2.1 Primary Button — `.btn-primary`
Use for: the single main action per page/modal (Save, Export, Add).

```tsx
<button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <Icon size={16} /> Label
</button>
```

- Background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`
- Text: white, `fontWeight: 600`
- Hover: `translateY(-2px)` + glow shadow — handled by CSS class

### 2.2 Secondary Button — `.btn-secondary`
Use for: secondary actions (Cancel, Reset, Toggle), navigation, and icon-only toolbar buttons.

```tsx
<button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
  <Icon size={14} /> Label
</button>
```

- Background: `var(--bg-card)`, Border: `var(--glass-border)`, Text: `var(--text-primary)`

### 2.3 Danger Button
Use for: destructive actions (Delete, Purge, Remove). Always ask for confirmation.

```tsx
<button
  className="btn-secondary"
  style={{
    background: 'rgba(255, 77, 77, 0.12)',
    border: '1px solid rgba(255, 77, 77, 0.35)',
    color: 'var(--danger)',
    display: 'flex', alignItems: 'center', gap: '8px'
  }}
>
  <Trash2 size={16} /> Delete
</button>
```

### 2.4 Ghost / Icon Button
Use for: inline row actions (edit pencil, close X, sort handle), notes buttons, expand toggles.

```tsx
<button
  style={{
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
    padding: '4px', borderRadius: '6px'
  }}
>
  <Icon size={16} />
</button>
```

- Active/selected state: `color: 'var(--accent-primary)'`

### 2.5 Size Variants
| Variant | Padding | Font size | Icon size |
|---|---|---|---|
| Default | `10px 20px` | `0.9rem` | 16px |
| Small (table rows, inline) | `4px 10px` or `4px 12px` | `0.8rem` | 14px |
| Compact (modal actions) | `6px 16px` | `0.85rem` | 14-16px |

### Rules
- Always show icon + label for primary actions.
- **Row-level actions are icon-only ghost buttons with a `title` attribute.** No labels in table rows.
- **Never** mix multiple different button styles for the same category of actions in the same row (e.g., all row-level actions use the same pattern).
- Modals use solid background (`isLight ? '#ffffff' : '#1a1d28'`), not glass-card.

---

## 3. Inputs & Form Controls

### 3.1 Standard Input / Textarea

```tsx
<input
  style={{
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
  }}
/>
```

**Do NOT use**: `var(--border-color)` (not defined — border will be invisible), `var(--glass-border)` (full border shorthand for cards/panels, not form controls). Always use `var(--input-border)` (color-only token).

**Minimal inline style pattern** (preferred for simple calculators/forms, rely on global CSS):

```tsx
<input type="number" value={val} onChange={...} style={{ width: '100%' }} />
```

Global `main.css` already applies `background: var(--input-bg)`, `border: 1px solid var(--input-border)`, `color: var(--input-text)`, `padding: 10px`, `border-radius: 8px` to all `input` elements. Only add inline styles when you need to override (e.g. custom width, monospace font).

### 3.2 Standard Select / Dropdown

```tsx
<select
  style={{
    padding: '10px',
    borderRadius: '8px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    cursor: 'pointer',
  }}
>
```

### 3.3 Form Label

```tsx
<label style={{
  display: 'block',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  fontWeight: '500',
}}>
  Label Text
</label>
```

### 3.4 Form Group (label + input)

```tsx
<div>
  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
    Field Name
  </label>
  <input ... />
</div>
```

### 3.5 Inline Color Input (Settings)
```tsx
<input type="color" style={{ width: '36px', height: '32px', padding: '2px', borderRadius: '4px', border: '1px solid var(--input-border)', cursor: 'pointer' }} />
```

---

## 4. Cards & Sections

### 4.1 Page-level Section — `.glass-card`

```tsx
<section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
  <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Section Title</h3>
  {/* content */}
</section>
```

### 4.2 Inline Card (non-glass, e.g. table wrapper, status card)

```tsx
<div style={{
  background: 'var(--bg-card)',
  borderRadius: '12px',
  border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
}}>
```

Use `.glass-card` (with blur) for primary content containers. Use the inline pattern for secondary surfaces inside a page (summary stats, status manager panel, table wrapper).

### 4.3 Stat/Metric Card

```tsx
<div style={{
  padding: '16px 24px',
  background: 'var(--bg-card)',
  borderRadius: '10px',
  border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
}}>
  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
    Label
  </div>
  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
    {value}
  </div>
</div>
```

### 4.4 Highlighted Metric (accent color)

For key results/outputs (calculator results, totals):
```tsx
<div style={{
  padding: '16px',
  background: 'rgba(0, 210, 255, 0.08)',
  borderRadius: '10px',
  border: '1px solid rgba(0, 210, 255, 0.2)',
}}>
```

Use the accent color tints consistently:
- Blue (primary): `rgba(0, 210, 255, 0.08)` / `rgba(0, 210, 255, 0.2)`
- Green (success/totals): `rgba(0, 255, 136, 0.08)` / `rgba(0, 255, 136, 0.2)`
- Orange (commission/rates): `rgba(255, 165, 0, 0.08)` / `rgba(255, 165, 0, 0.2)`
- Purple (secondary calc): `rgba(150, 100, 255, 0.08)` / `rgba(150, 100, 255, 0.2)`

---

## 5. Modals / Overlays

### 5.1 Overlay

```tsx
<div style={{
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000
}}>
```

### 5.2 Modal Dialog

```tsx
<div style={{
  background: isLight ? '#ffffff' : '#1a1d28',
  borderRadius: '16px',
  padding: '28px',
  width: '520px',  // adjust per use case
  maxWidth: '95vw',
  maxHeight: '90vh',
  overflow: 'auto',
  border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
}}>
```

### 5.3 Modal Header

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
    <Icon size={18} color="var(--accent-primary)" />
    Modal Title
  </h3>
  <button
    onClick={onClose}
    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '6px' }}
  >
    <X size={18} />
  </button>
</div>
```

### 5.4 Modal Footer (actions)

```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--table-border)' }}>
  <button className="btn-secondary" onClick={onClose}>Cancel</button>
  <button className="btn-primary" onClick={handleSave}>Save</button>
</div>
```

---

## 6. Tables

### 6.1 Table Wrapper

```tsx
<div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
```

For scrollable/sticky tables:
```tsx
<div style={{
  background: 'var(--bg-card)', borderRadius: '12px',
  border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
  overflow: 'auto', maxHeight: 'calc(100vh - 320px)'
}}>
```

### 6.2 Table Header

```tsx
<th style={{
  padding: '14px 16px',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  background: 'var(--table-header-bg)',
  borderBottom: '1px solid var(--table-border)',
  textAlign: 'left',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}}>
```

### 6.3 Table Row / Cell

```tsx
<tr style={{ borderBottom: '1px solid var(--table-border)' }}>
  <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>value</td>
```

- Primary data (vessel name, key fields): `color: 'var(--text-primary)', fontWeight: '600'`
- Secondary data (IMO, dates, IDs): `color: 'var(--text-secondary)'`
- Numeric data: add `fontFamily: 'monospace', fontSize: '0.85rem'` for fixed-width (policy numbers, codes)
- Totals row: `background: 'var(--table-header-bg)', fontWeight: '700'`

### 6.4 Inline Row Actions (3-button pattern)

All three row-level action buttons should use the **same visual pattern**. Standard row actions:

```tsx
<div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
  {/* Edit */}
  <button
    onClick={() => onEdit(item)}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px', borderRadius: '6px' }}
    title="Edit"
  >
    <Edit3 size={16} />
  </button>
  {/* Renew / secondary action */}
  <button
    onClick={() => onRenew(item)}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', display: 'flex', padding: '4px', borderRadius: '6px' }}
    title="Renew"
  >
    <RefreshCw size={16} />
  </button>
  {/* Delete */}
  <button
    onClick={() => onDelete(item)}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '4px', borderRadius: '6px' }}
    title="Delete"
  >
    <Trash2 size={16} />
  </button>
</div>
```

---

## 7. Page Structure

### 7.1 Page Header

```tsx
<header style={{ marginBottom: '24px' }}>
  <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Page Title</h1>
  <p style={{ color: 'var(--text-secondary)' }}>Short description of this page.</p>
</header>
```

### 7.2 Page Layout (header + toolbar + content)

```tsx
<div className="fade-in">
  <header style={{ marginBottom: '24px' }}>...</header>
  <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
    {/* toolbar: search, filters, action buttons */}
  </div>
  {/* main content */}
</div>
```

---

## 8. Typography

| Use | Size | Weight | Color |
|---|---|---|---|
| Page title (h1) | `2rem` | 700 | `var(--text-primary)` |
| Section title (h2) | `1.3rem` | 700 | `var(--text-primary)` |
| Card/modal title (h3) | `1.05rem–1.1rem` | 700 | `var(--text-primary)` |
| Sub-header | `1rem` | 600 | `var(--text-primary)` |
| Body | `0.9rem` | 400 | `var(--text-primary)` |
| Label / Helper | `0.85rem` | 500 | `var(--text-secondary)` |
| Caption / Stat label | `0.75–0.8rem` | 400–500 | `var(--text-secondary)` |
| Table header | `0.8rem` | 600 | `var(--text-secondary)` |
| Table body | `0.88–0.9rem` | 400–600 | varies |
| Monospace (IDs, code) | `0.85rem` | 400 | `var(--text-secondary)` |

---

## 9. Spacing Scale

| Level | Value | Usage |
|---|---|---|
| XS | `4px` | Gap between icon+label inside button |
| S | `6px–8px` | Gap between sibling inline elements |
| M | `12px` | Row padding, gap in form grids |
| L | `16px` | Card padding-side, section inner gap |
| XL | `20px–24px` | Section padding, between form groups |
| XXL | `32px` | Between major page sections |

---

## 10. Status / Badge Indicators

### OFAC / Compliance Status Badges
Use colored pill badges, not text-only:

```tsx
<span style={{
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '0.72rem',
  fontWeight: '700',
  background: STATUS_COLORS[status].bg,
  color: STATUS_COLORS[status].text,
}}>
  {status}
</span>
```

Standard status color map:
- `CLEARED` → `background: 'rgba(0,255,136,0.15)', color: '#00ff88'`
- `POTENTIAL_MATCH` → `background: 'rgba(255,204,0,0.15)', color: '#ffcc00'`
- `MATCH` / `SANCTIONED` → `background: 'rgba(255,77,77,0.15)', color: 'var(--danger)'`
- `PENDING` / `CHECKING` → `background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)'`

### Renewal Status Dropdown (in Renewals table)
When a status is assigned:
- Text color: `'#000000'` (always black regardless of status color)
- Font weight: `700`
- Background: `${statusColor}22` (hex color + 22 = ~13% opacity)
- Border: `2px solid ${statusColor}`

---

## 11. Collapsible Section Pattern (Admin Panel style)

```tsx
<section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
  <h3
    onClick={() => toggleSection('sectionId')}
    style={{
      marginBottom: collapsed ? 0 : '16px',
      display: 'flex', alignItems: 'center', gap: '8px',
      cursor: 'pointer', userSelect: 'none'
    }}
  >
    {collapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
    <Icon size={20} /> Section Title
  </h3>
  {!collapsed && <>{/* content */}</>}
</section>
```

---

## 12. Empty States

```tsx
<div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px' }}>
  <Icon size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
  <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
    Nothing here yet
  </div>
  <p style={{ color: 'var(--text-secondary)' }}>Descriptive helper text.</p>
</div>
```

---

## 13. Loading States

- Full-section: `<p style={{ color: 'var(--text-secondary)' }}>Loading...</p>`
- Button: `<Loader2 size={16} className="spinner" />` inline before label text, button disabled
- Inline: `<RefreshCw size={14} className="spinner" />`

---

## 14. Key Rules Summary

1. **One primary button per modal/page section.** All other actions are secondary or ghost.
2. **Row-level actions are always ghost buttons.** No mixed styling within the same table.
3. **Form inputs always use `--input-bg` and `--input-border`.** Cards use `--glass-border`.
4. **Modals always use the solid background pattern** (`isLight ? '#ffffff' : '#1a1d28'`), not glass-card.
5. **Never hardcode `#color` for text or backgrounds** that need to respect theme — always use CSS variables.
6. **Spacing**: `padding: '24px'` for glass-card sections, `padding: '28px'` for modal dialogs.
7. **Always use `display: flex, alignItems: 'center', gap: '8px'` for icon+text button content.**
8. **Danger actions** always get the rgba(255,77,77,...) treatment — never blue or neutral.
9. **All icon sizes**: 16px for actions/buttons, 18-20px for section headers, 48px for empty-state icons.
10. **Page-level empty states** always include a large (48px, opacity 0.3) icon.
