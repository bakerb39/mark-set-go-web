Stable book ID update

Replace:
- public/reading-goals.js
- public/index.html

Important:
- Existing test goals are intentionally ignored because the storage key changed to V2.
- Recreate each book goal after deploying.
- New goals store the selected library book's stable document ID as bookId.
- Goal matching and progress use bookId only; titles are display-only.
- Mark checks the stable ID when the book opens and again when reading starts.
