# Change Log

All notable changes to the "prisma-visualizer" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Add "Prisma Visualizer: Open ERD" command, rendering an interactive entity-relationship diagram
  (auto-layout, pan/zoom, drag, click-to-highlight) for `schema.prisma` beside the editor.
- Live-refresh the diagram on save, with a `prisma-visualizer.schemaPath` setting to override the
  default `prisma/schema.prisma` location.