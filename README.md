# Prisma Visualizer

Visualize a `schema.prisma` file as an interactive entity-relationship diagram, right beside your editor.

## Features

- **Prisma Visualizer: Open ERD** command (also available from the title bar and context menu of a `.prisma` file) opens an interactive diagram beside the schema editor.
- Entity boxes list fields with their type, and mark primary keys, foreign keys, and unique columns.
- Relations are drawn with cardinality labels (`1`/`N`), including self-relations and multiple relations between the same two models.
- Pan (drag the background), zoom (scroll wheel), drag individual entities to reposition them, and click an entity to highlight its relations.
- The diagram refreshes automatically when the schema is saved, preserving your pan/zoom/drag state.
- Parse errors and a missing schema file are shown as a banner without discarding the last successfully rendered diagram.

## Requirements

No external dependencies. The [Prisma language extension](https://marketplace.visualstudio.com/items?itemName=Prisma.prisma) is recommended for `.prisma` syntax highlighting, but not required.

## Extension Settings

This extension contributes the following setting:

- `prisma-visualizer.schemaPath`: Path to `schema.prisma`, relative to the workspace root. If empty, defaults to `prisma/schema.prisma`, falling back to the active `.prisma` editor.

## Known Issues

- Only a single `schema.prisma` file is supported; Prisma's multi-file schema folders are not merged.
- Composite `@@unique`/`@@id` block attributes aren't considered when distinguishing one-to-one from one-to-many relations (only field-level `@id`/`@unique` are).

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
