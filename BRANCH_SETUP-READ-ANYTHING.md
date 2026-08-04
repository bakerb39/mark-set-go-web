# Branch setup

From the existing repository working tree:

```bash
git checkout -b feature/read-anything-import-system
```

Copy the contents of this package into the repository, then run:

```bash
npm install
node --check server.js
node --check public/read-anything.js
git add .
git commit -m "Add unified Read Anything import system"
git push -u origin feature/read-anything-import-system
```

Deploy this branch to the Render test service before merging to `main`.
