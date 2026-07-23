# BDUI Client Renderer Contract

This is the hard boundary the client implements. The backend produces the
`Screen` tree ([see backend BDUI engine](../../../firo-backend/docs/architecture/03-bdui-engine.md));
the client renders it through these interfaces. Shown in TypeScript for clarity —
the Dart implementation mirrors it, with models generated from the OpenAPI spec.

```ts
// The renderer is a pure function of (tree, theme, registry, hydrator).
interface Renderer {
  render(screen: Screen, ctx: RenderContext): NativeView;
}

interface RenderContext {
  registry: ComponentRegistry;        // type -> WidgetFactory
  theme: ResolvedTheme;               // token names -> native values (from /v1/theme)
  hydrator: EntityHydrator;           // contentRef -> entity (local cache + offline)
  actionDispatcher: ActionDispatcher; // Action -> native intent (nav/save/track)
  routes: RouteRegistry;              // routeId -> native destination (+ fallback)
  telemetry: Telemetry;               // impression / exposure / interaction events
}

interface ComponentRegistry {
  get(type: string): WidgetFactory | undefined;
  fallback: WidgetFactory;            // MANDATORY non-crashing UnknownComponentFallback
}

interface WidgetFactory {
  type: string;                       // "card.v1"
  minSchemaVersion: number;
  build(node: ComponentNode, ctx: RenderContext): NativeWidget;
}

interface ActionDispatcher {
  // never executes server business logic locally; maps intent to a native action
  dispatch(action: Action, source: ComponentNode): void;
}

interface EntityHydrator {
  hydrate(ref: string, mode: "eager" | "on_visible"): Promise<Entity | Tombstone>;
}
```

## Renderer responsibilities (client-native, NOT server-controlled)

- Own **all** animation, spring physics, haptics, scroll behaviour, transitions.
- Map `props.emphasis` / `props.density` **intent** → native styling via theme
  tokens (e.g. `density: "comfortable"` → `space.section.comfortable`).
- Enforce the fallback rule: unknown `type` → `registry.fallback`; unknown props
  → ignore.
- Fire viewport **impressions/exposures** (echoing the experiment `exposureToken`)
  to telemetry, so experiment accounting is honest.
- Hydrate `contentRef`s lazily; hide tombstones; serve from cache when offline.
- Realize **accessibility natively** — the server supplies text/semantics, the
  client builds the a11y tree (labels, dynamic type, VoiceOver/TalkBack).

## Capability handshake (client → server, every request)

```
X-Firo-Schema-Version: 1
X-Firo-App-Build: ios/3.4.0 (5120)
X-Firo-Capabilities: video,image360,haptics,theme.dark
X-Firo-Components: hero.v1,carousel.v1,card.v1,section_header.v1,grid.v1,feed.v1,story.v1,banner.v1,recommendation_block.v1,onboarding_step.v1,app_bar.v1
X-Firo-Theme-Version: 2026.07.1
If-None-Match: W/"a1b2c3"
```

The client advertises what it can render; the server composes to that envelope so
older builds degrade gracefully instead of crashing.

## Compatibility rules (frozen)

- **Additive is safe:** new component types, new optional props, new action types
  → old clients ignore or fall back.
- **Breaking = new `.vN`:** never mutate `hero.v1` semantics; ship `hero.v2`.
- **`schemaVersion`** bumps only for rare envelope-level breaking changes; the
  server supports version N and N−1 simultaneously.
