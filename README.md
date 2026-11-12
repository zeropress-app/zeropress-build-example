# ZeroPress Build Example

A small static site, with its theme, content, and generated output in one repository.

[Demo](https://build.demo.zeropress.app/) · [Documentation](https://zeropress.dev/)

| File | Purpose |
| --- | --- |
| [`theme/`](theme/) | Templates and styles |
| [`zeropress-preview-data.json`](zeropress-preview-data.json) | Content and site settings |
| [`public/`](public/) | Images and other static files |
| [`dist/`](dist/) | Generated website |

To rebuild, use Node.js 22.22.0 or later and run from the repository root:

```sh
npx @zeropress/build ./theme --data ./zeropress-preview-data.json --out ./dist --empty-out-dir
```
