# Faces — Project Rules for Claude

## Documentation Rules

- **No documentation file may exceed 1,000 lines.** If content grows beyond that, convert the file into a folder of the same name. The folder must contain:
  - `index.md` — a site map with a brief overview and links to each sub-document
  - Individual topic files covering the split-out sections
- Apply this rule recursively: sub-documents also cap at 1,000 lines.

## Code Rules

- **No source file may exceed 500 lines.** Split before you write, not after.
- Before writing any code, a **clearly defined architecture document must exist** in `docs/`. Code that has no corresponding architecture doc should not be generated.
- **No generated files in the repo.** This includes:
  - Compiled models (`.mlmodelc`, `.tflite`, built binaries)
  - Build artefacts (`build/`, `dist/`, `DerivedData/`, `Pods/`, `.gradle/`)
  - IDE metadata (`.idea/`, `.vscode/`, `*.xcuserdata`)
  - Auto-generated lock files committed without intent
- Keep `.gitignore` accurate and up to date. If a new generated file type is introduced, add it to `.gitignore` immediately.
