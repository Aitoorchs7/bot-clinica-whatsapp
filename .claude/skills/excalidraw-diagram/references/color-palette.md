# Color Palette & Brand Style

**This is the single source of truth for all colors and brand-specific styles.** To customize diagrams for your own brand, edit this file — everything else in the skill is universal.

---

## Shape Colors (Semantic)

Colors encode meaning, not decoration. Each semantic purpose has a fill/stroke pair.

| Semantic Purpose | Fill | Stroke |
|------------------|------|--------|
| Primary/Neutral | `#659DF2` | `#1a1a1a` |
| Secondary | `#83B0F5` | `#1a1a1a` |
| Tertiary | `#C2D8FA` | `#1a1a1a` |
| Start/Trigger | `#C2D8FA` | `#3D7BE0` |
| End/Success | `#ffffff` | `#3D7BE0` |
| Warning/Reset | `#C2D8FA` | `#3D7BE0` |
| Decision | `#D9E8FC` | `#3D7BE0` |
| AI/LLM | `#83B0F5` | `#1a1a1a` |
| Inactive/Disabled | `#C2D8FA` | `#1a1a1a` (use dashed stroke) |
| Error | `#659DF2` | `#1a1a1a` |

**Rule**: Always pair a darker stroke with a lighter fill for contrast.

---

## Text Colors (Hierarchy)

Use color on free-floating text to create visual hierarchy without containers.

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#3D7BE0` | Section headings, major labels |
| Subtitle | `#1a1a1a` | Subheadings, secondary labels |
| Body/Detail | `#1a1a1a` | Descriptions, annotations, metadata |
| On light fills | `#1a1a1a` | Text inside light-colored shapes |
| On dark fills | `#ffffff` | Text inside dark-colored shapes |

---

## Evidence Artifact Colors

Used for code snippets, data examples, and other concrete evidence inside technical diagrams.

| Artifact | Background | Text Color |
|----------|-----------|------------|
| Code snippet | `#1a1a1a` | `#659DF2` (blue) |
| JSON/data example | `#1a1a1a` | `#ffffff` (white) |

---

## Default Stroke & Line Colors

| Element | Color |
|---------|-------|
| Arrows | Use the stroke color of the source element's semantic purpose |
| Structural lines (dividers, trees, timelines) | `#1a1a1a` |
| Marker dots (fill + stroke) | `#3D7BE0` |

---

## Background

| Property | Value |
|----------|-------|
| Canvas background | `#ffffff` |
