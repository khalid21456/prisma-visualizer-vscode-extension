# Change Log

All notable changes to the "prisma-visualizer" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Add "Prisma Visualizer: Open ERD" command, rendering an interactive entity-relationship diagram
  (auto-layout, pan/zoom, drag, click-to-highlight) for `schema.prisma` beside the editor.
- Live-refresh the diagram on save, with a `prisma-visualizer.schemaPath` setting to override the
  default `prisma/schema.prisma` location.
- Export the diagram as a themed PNG from a button in the canvas.
- Export the schema as PostgreSQL DDL (`backup.sql`) via an "Export SQL" button or the
  "Prisma Visualizer: Export PostgreSQL SQL" command — enum types, tables with native `@db.*` types
  and defaults, keys, indexes, foreign keys with referential actions, and implicit many-to-many join
  tables. Structure only; no database connection is used.
- Fix `getArrayArg` crashing on an empty `@default([])` and silently dropping index columns that
  carry modifiers.