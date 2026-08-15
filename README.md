# Prisma Visualizer

Visualize a `schema.prisma` file as an interactive entity-relationship diagram, right beside your editor.

## Features

- **Prisma Visualizer: Open ERD** command (also available from the title bar and context menu of a `.prisma` file) opens an interactive diagram beside the schema editor.
- Entity boxes list fields with their type, and mark primary keys, foreign keys, and unique columns.
- Relations are drawn with cardinality labels (`1`/`N`), including self-relations and multiple relations between the same two models.
- Pan (drag the background), zoom (scroll wheel), drag individual entities to reposition them, and click an entity to highlight its relations.
- Export the diagram as a PNG, or export the schema as PostgreSQL DDL (`backup.sql`) — `CREATE TYPE` / `CREATE TABLE` / indexes / foreign keys, generated straight from `schema.prisma` with no database connection required.
- The diagram refreshes automatically when the schema is saved, preserving your pan/zoom/drag state.
- Parse errors and a missing schema file are shown as a banner without discarding the last successfully rendered diagram.

## Requirements

No external dependencies. The [Prisma language extension](https://marketplace.visualstudio.com/items?itemName=Prisma.prisma) is recommended for `.prisma` syntax highlighting, but not required.

## Extension Settings

This extension contributes the following setting:

- `prisma-visualizer.schemaPath`: Path to `schema.prisma`, relative to the workspace root. If empty, defaults to `prisma/schema.prisma`, falling back to the active `.prisma` editor.

## Exporting SQL

**Prisma Visualizer: Export PostgreSQL SQL** (or the *Export SQL* button in the diagram) writes a `backup.sql` containing the schema's PostgreSQL DDL, closely matching what `prisma migrate` would generate: enum types, tables with native `@db.*` types and defaults, primary keys, unique/plain indexes, foreign keys with their referential actions, and the join tables Prisma creates implicitly for many-to-many relations.

Statements are ordered so the file applies top to bottom inside a single transaction. **It contains structure only — no table data.** A true data backup would require connecting to a live database, which this extension never does.

Not currently emitted: views, `@@schema` multi-schema layouts, `@ignore`, and `@@index` modifiers (`sort:`, `length:`, `type:`). Unrecognized native types are passed through with a `-- WARNING:` comment rather than dropped.

## Known Issues

- Only a single `schema.prisma` file is supported; Prisma's multi-file schema folders are not merged.
- Composite `@@unique`/`@@id` block attributes aren't considered when distinguishing one-to-one from one-to-many relations (only field-level `@id`/`@unique` are).

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).
