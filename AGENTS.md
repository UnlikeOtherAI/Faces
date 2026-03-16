# Faces — Project Standards

## Documentation

- No doc file may exceed 1,000 lines. If it does, convert it to a same-named folder with `index.md` (sitemap + overview) and individual topic files. Apply recursively.

## Code

- No source file may exceed 500 lines. Split before writing, not after.
- A doc in `docs/` defining the architecture must exist before any code is written for that component.
- No generated files in the repo (compiled models, build artefacts, IDE metadata). Keep `.gitignore` current.

## Model

We train our own CoreML and TFLite models — see [docs/model-training.md](docs/model-training.md). Do not download or vendor third-party pretrained weights.

## Testing

All example apps must be fully E2E tested on iOS and Android — see [docs/testing.md](docs/testing.md).

## Editing this file

Keep it short. Extract any process or tool explanation to a `docs/` file and link it. Never document how something works inline here.
