## Fix Auto-Dial Settings Modal Scrolling

The "Settings" (Auto-Dial Settings) modal in `src/components/CallList.tsx` (lines 2396–2605) uses `<DialogContent className="max-w-md">` with no height cap, so on shorter viewports content gets clipped with no way to scroll.

### Change 1 — Modal wrapper (line 2397)
Replace:
```tsx
<DialogContent className="max-w-md">
```
with:
```tsx
<DialogContent className="max-w-lg w-full mx-4 max-h-[85vh] p-0 flex flex-col gap-0">
```

This caps the modal height at 85vh, keeps width responsive, and turns the dialog into a flex column so the header/footer can stay pinned while the middle scrolls. (Radix Dialog already centers vertically via `top-50% translate-y-[-50%]`, so the modal naturally stays centered.)

### Change 2 — Sticky header (lines 2398–2403)
Replace:
```tsx
<DialogHeader>
  <DialogTitle>Auto-Dial Settings</DialogTitle>
  <DialogDescription>
    Configure retry logic, limits, and business hours
  </DialogDescription>
</DialogHeader>
```
with:
```tsx
<DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
  <DialogTitle>Auto-Dial Settings</DialogTitle>
  <DialogDescription>
    Configure retry logic, limits, and business hours
  </DialogDescription>
</DialogHeader>
```

### Change 3 — Scrollable middle section (line 2405)
Replace:
```tsx
<div className="space-y-6 py-4">
```
with:
```tsx
<div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
```

This is the only scroll container; field layouts and toggle styles inside are untouched.

### Change 4 — Sticky footer (line 2589)
Replace:
```tsx
<div className="flex gap-2">
```
with:
```tsx
<div className="flex gap-2 px-6 py-4 border-t shrink-0 bg-background">
```

### Out of scope
- No changes to any field row, switch, slider, or other modals.
- No changes to `DialogContent` base styles in `src/components/ui/dialog.tsx`.
