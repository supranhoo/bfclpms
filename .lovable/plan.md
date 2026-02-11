

# Add 35-Character Limit to KRA Category Name Input

## Change

In `src/pages/admin/Categories.tsx`, add a `maxLength={35}` attribute to the Name input field inside the Add/Edit KRA Category dialog. Also add a helper text below the input showing the remaining characters.

### File: `src/pages/admin/Categories.tsx`

- Add `maxLength={35}` to the `<Input>` for the Name field
- Add a small helper text below showing character count (e.g., "12/35 characters")

### File: `DOCUMENTATION.md`

- Note the 35-character limit for KRA category names

