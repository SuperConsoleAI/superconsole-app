# Page Section Guide — Tooltip System

> **For any agent creating or editing page sections in `/src/components/pagex/`**  
> Follow this guide exactly so the visual editor tooltip works on every element.

---

## How the Tooltip System Works

When a user clicks any element in the page editor, `PageSections.tsx` walks up the DOM tree and looks for the first element with any of these attributes:

| Attribute | Purpose |
|---|---|
| `data-field` | Field key path in section data (e.g. `title`, `items.0.h2`) |
| `data-element-type` | How the tooltip renders: `text` \| `button` \| `image` \| `box` \| `link` |
| `data-color-field` | Which data key receives the background/box color |
| `data-current-color` | Current live color value (for the color picker to initialise) |
| `data-default-color` | Fallback text color shown in the picker when no saved value exists |
| `data-default-bg` | Fallback background color for `button`/`box` types |
| `data-link-field` | Which data key receives the URL (for links/buttons) |

---

## Element-by-Element Rules

### Text elements (`h1`, `h2`, `h3`, `p`, `span`, `strong`)

```tsx
<h2
  data-field="title"
  data-default-color="var(--text-primary)"
  style={`
    color: ${data.titleColor || 'var(--text-primary)'};
    background: ${data.titleHighlight || 'transparent'};
    font-weight: ${data.titleWeight || '600'};
    font-style: ${data.titleStyle || 'normal'};
    cursor: ${editable ? 'text' : 'default'};
  `}
>
  {data.title || "Default text"}
</h2>
```

**Rules:**
- Always set `data-field` to the exact key stored in `data` (e.g. `title`, `items.0.question`)
- Always set `data-default-color` to the fallback CSS variable so the color picker has a starting value
- Always read `data.fieldColor`, `data.fieldHighlight`, `data.fieldWeight`, `data.fieldStyle` in the inline style
- Always add `cursor: ${editable ? 'text' : 'default'}` so users know the element is editable

**Naming convention for color keys** — append the color type to the field name:

| Field name | Color key | Highlight key | Weight key | Style key |
|---|---|---|---|---|
| `title` | `titleColor` | `titleHighlight` | `titleWeight` | `titleStyle` |
| `description` | `descriptionColor` | `descriptionHighlight` | `descriptionWeight` | `descriptionStyle` |
| `items.0.h2` | `items.0.h2Color` | `items.0.h2Highlight` | — | — |

---

### Image elements (`img`)

```tsx
<img
  data-field="imageUrl"
  data-element-type="image"
  src={data.imageUrl || "https://placehold.co/640x480"}
  alt="Description"
  width={640}
  height={480}
  style={`cursor: ${editable ? 'pointer' : 'default'};`}
/>
```

**Rules:**
- Set `data-element-type="image"` — the tooltip opens an image URL input
- Set `data-field` to the key that stores the URL
- Optionally add `data-link-field` if clicking the image should navigate somewhere

---

### Button / Link elements (`a`, `button`)

```tsx
<a
  data-field="buttonText"
  data-element-type="button"
  data-link-field="buttonUrl"
  data-color-field="buttonBgColor"
  data-current-color={data.buttonBgColor || 'var(--button-primary-bg)'}
  data-default-color="var(--button-primary-text)"
  data-default-bg="var(--button-primary-bg)"
  href={!editable ? (data.buttonUrl ?? '#') : '#'}
  onClick$={(e) => editable && e.preventDefault()}
  style={`
    background: ${data.buttonBgColor || 'var(--button-primary-bg)'};
    color: ${data.buttonTextColor || 'var(--button-primary-text)'};
    cursor: ${editable ? 'text' : 'pointer'};
  `}
>
  {data.buttonText || "Click Here"}
</a>
```

**Critical — button text color field name:**  
The tooltip auto-appends `Color` to the `data-field` name to derive the text color key.  
If `data-field="buttonText"` → text color is written to `buttonTextColor`.  
If `data-field="images.0.buttonText"` → text color is written to `images.0.buttonTextColor`.  
**Your data reading must match:** `data.buttonTextColor` (not `data.buttonColor`).

| Attribute | Value |
|---|---|
| `data-element-type` | `"button"` |
| `data-color-field` | Key for **background** color (e.g. `buttonBgColor`) |
| `data-current-color` | Current background color value |
| `data-default-color` | Default text color |
| `data-default-bg` | Default background color |
| `data-link-field` | Key for the URL |

---

### Box / Card containers (background color)

```tsx
<div
  data-element-type={editable ? "box" : undefined}
  data-color-field={`items.${index}.bgColor`}
  data-current-color={item.bgColor || 'var(--surface-2)'}
  data-default-bg="var(--surface-2)"
  style={`background-color: ${item.bgColor || 'var(--surface-2)'};`}
>
```

**Rules:**
- Do **NOT** put `data-field` on the container — it intercepts clicks meant for child text elements
- Only use `data-element-type="box"` + `data-color-field` + `data-current-color` + `data-default-bg`
- The user clicks the background area (not a child element) to open the box color picker

---

## Schema — Always Add Color Fields

Every text field in the schema should have a matching color field. This exposes them in the editor panel sidebar too.

```ts
export const MySectionSchema = [
  { name: 'title',            label: 'Title',            type: 'text' },
  { name: 'titleColor',       label: 'Title Color',       type: 'text' },
  { name: 'description',      label: 'Description',       type: 'textarea' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'buttonText',       label: 'Button Text',       type: 'text' },
  { name: 'buttonTextColor',  label: 'Button Text Color', type: 'text' }, // must match tooltip auto-suffix
  { name: 'buttonBgColor',    label: 'Button Background', type: 'text' },
  { name: 'buttonUrl',        label: 'Button Link',       type: 'text' },
  {
    name: 'items',
    label: 'Items',
    type: 'array',
    fields: [
      { name: 'heading',      label: 'Heading',           type: 'text' },
      { name: 'headingColor', label: 'Heading Color',     type: 'text' },
      { name: 'bgColor',      label: 'Card Background',   type: 'text' },
    ]
  }
];
```

---

## Array Items — Dot-Notation Paths

For repeated items (slides, FAQ cards, people, etc.), the field path uses dot-notation with the index:

```tsx
{items.map((item, index) => (
  <div key={index}>
    <h2
      data-field={`items.${index}.heading`}
      data-default-color="var(--text-primary)"
      style={`color: ${item.headingColor || 'var(--text-primary)'};`}
    >
      {item.heading}
    </h2>
  </div>
))}
```

The state handler in `PageSections.tsx` correctly splits on `.` to write nested values.

---

## Common Mistakes

| ❌ Wrong | ✅ Right |
|---|---|
| `data-field="buttonColor"` on a button (using color key as data-field) | `data-field="buttonText"` — field is the **text content** key |
| `data-field="items.0.title"` when data stores `items.0.question` | Match the exact stored key: `data-field="items.0.question"` |
| `data-field` on a card container AND on text inside it | Remove `data-field` from container; keep only `data-color-field` |
| Hardcoded `color: var(--text-primary)` with no `data-default-color` | Add `data-default-color="var(--text-primary)"` so the picker initialises |
| Reading `data.buttonColor` for button text after tooltip updates | Read `data.buttonTextColor` — tooltip writes `{fieldName}Color` |
| `{(data.title || data.description) && ...}` — hides header in editable empty state | `{(data.title || data.description || editable) && ...}` |

---

## Full Section Template

```tsx
import { component$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing } = designSystem;

export interface MySectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const MySectionSchema = [
  { name: 'title',            label: 'Title',            type: 'text' },
  { name: 'titleColor',       label: 'Title Color',       type: 'text' },
  { name: 'description',      label: 'Description',       type: 'textarea' },
  { name: 'descriptionColor', label: 'Description Color', type: 'text' },
  { name: 'buttonText',       label: 'Button Text',       type: 'text' },
  { name: 'buttonTextColor',  label: 'Button Text Color', type: 'text' },
  { name: 'buttonBgColor',    label: 'Button Background', type: 'text' },
  { name: 'buttonUrl',        label: 'Button Link',       type: 'text' },
];

export const MySectionDefaultData = {
  title: "Section Title",
  description: "Section description.",
  buttonText: "Click Here",
  buttonUrl: "#"
};

export const MySection = component$<MySectionProps>(({ data, order, editable = false }) => {
  return (
    <section style={`order: ${order}; padding: 4rem 1rem; background: var(--surface-2);`}>
      <div style={`max-width: 54rem; margin: 0 auto; display: flex; flex-direction: column; gap: ${spacing.md}; text-align: center; align-items: center;`}>

        {/* Text element */}
        {(data.title || editable) && (
          <h2
            data-field="title"
            data-default-color="var(--text-primary)"
            style={`
              margin: 0;
              font-size: 2.25rem;
              font-weight: ${data.titleWeight || '600'};
              font-style: ${data.titleStyle || 'normal'};
              color: ${data.titleColor || 'var(--text-primary)'};
              background: ${data.titleHighlight || 'transparent'};
              cursor: ${editable ? 'text' : 'default'};
            `}
          >
            {data.title || "Section Title"}
          </h2>
        )}

        {/* Description */}
        {(data.description || editable) && (
          <p
            data-field="description"
            data-default-color="var(--text-secondary)"
            style={`
              margin: 0;
              color: ${data.descriptionColor || 'var(--text-secondary)'};
              background: ${data.descriptionHighlight || 'transparent'};
              font-weight: ${data.descriptionWeight || '400'};
              font-style: ${data.descriptionStyle || 'normal'};
              line-height: 1.6;
              cursor: ${editable ? 'text' : 'default'};
            `}
          >
            {data.description || "Description"}
          </p>
        )}

        {/* Button */}
        {(data.buttonText || editable) && (
          <a
            data-field="buttonText"
            data-element-type="button"
            data-link-field="buttonUrl"
            data-color-field="buttonBgColor"
            data-current-color={data.buttonBgColor || 'var(--button-primary-bg)'}
            data-default-color="var(--button-primary-text)"
            data-default-bg="var(--button-primary-bg)"
            href={!editable ? (data.buttonUrl ?? '#') : '#'}
            onClick$={(e) => editable && e.preventDefault()}
            style={`
              display: inline-flex; align-items: center; justify-content: center;
              height: 3rem; padding: 0 1.5rem; border-radius: 9999px;
              background: ${data.buttonBgColor || 'var(--button-primary-bg)'};
              color: ${data.buttonTextColor || 'var(--button-primary-text)'};
              text-decoration: none; font-weight: 600;
              cursor: ${editable ? 'text' : 'pointer'};
            `}
          >
            {data.buttonText || "Click Here"}
          </a>
        )}

      </div>
    </section>
  );
});
```

---

## Registration Checklist

When creating a new section, update all of these files:

- [ ] **`/src/components/pagex/MySectionSchema`** — export schema + defaultData + component
- [ ] **`/src/components/page/SectionSchemas.ts`** — import + add to `ComponentSchemas` and `ComponentDefaultData`
- [ ] **`/src/components/page/PageSections.tsx`** — import component + add `case "my_section":` to the render switch
- [ ] **`/src/components/page/SectionPickerModal.tsx`** — add entry to the appropriate category in `SECTION_GROUPS`
