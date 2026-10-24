<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep LUMO screens in dedicated browser-safe components and expose each screen through a leaf TanStack route; shared chrome lives around the root Outlet to preserve navigation and page metadata.
- Use the typed host-injected LumoIntegrations boundary for identity, AI, vision, voice, browser, and workspace providers; absent adapters must show unavailable states rather than fabricate results.
- Store only device appearance preferences locally and keep conversations and captures visit-only so the UI never implies unavailable cloud persistence.
- Keep the signature core as a frame-limited Canvas animation, avoiding a WebGL dependency and reducing mobile-device overhead.
- Use AI Elements for chat transcript, Markdown, and composition; scope chat styling so changes do not disturb other approved screens.
- Keep conversation messages and drafts in a visit-only external store with route-derived thread IDs so navigation preserves history without implying durable storage.
- Keep primary navigation to Home, Workspaces, and Settings; expose task screens through leaf workspace routes so the navigation stays focused.
- Use backend-confirmed states for terminal, Git, account, and provider connections; do not simulate outputs, connection results, or credentials.
