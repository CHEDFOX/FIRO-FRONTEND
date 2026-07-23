# Firo — Frontend (Client)

> **AI-powered travel _discovery_ platform.** Inspire first. Plan second. Book last.

This repository will hold the Firo mobile client: a **thin, deterministic
Backend-Driven UI (BDUI) rendering engine** built in **Flutter**. It renders
screens the backend composes — it does not contain product/business logic.

## Status: Phase 1 — Architecture

There is **no app code yet**. This repo currently contains the reviewed Phase 1
client architecture. The full system architecture (source of truth) lives in the
[`firo-backend`](../firo-backend) repo.

- Client renderer → [docs/architecture/renderer.md](docs/architecture/renderer.md)
- The contract the client implements → [docs/architecture/bdui-client-contract.md](docs/architecture/bdui-client-contract.md)
- The backend BDUI engine → [`firo-backend/docs/architecture/03-bdui-engine.md`](../firo-backend/docs/architecture/03-bdui-engine.md)
- The governing decision → [ADR-0003: semantics/presentation boundary](../firo-backend/docs/adr/0003-bdui-semantics-vs-presentation-boundary.md)

## The client's one job

Turn a backend-authored, versioned JSON UI tree into a pixel-perfect, 60/120fps,
animated, offline-capable native experience — **and nothing more.**

| The client OWNS (presentation) | The client NEVER does (server owns) |
|---|---|
| Animation, gestures, transitions, haptics | Ranking, personalization, content selection |
| Spacing scale (from tokens), theming | Pricing, eligibility, feature-flag evaluation |
| Offline cache, optimistic UI, a11y tree | Deciding which screen/section/component appears |

## Stack
Flutter (Dart 3, Impeller) · Riverpod 2 · go_router (backend-driven) · freezed
models generated from the backend OpenAPI 3.1 spec · Isar/Drift offline store.

See [ADR-0008](../firo-backend/docs/adr/0008-flutter-client.md) *(Flutter choice —
confirm before Phase 5)*.
