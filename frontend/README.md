# LUMO Core

You are continuing development of my existing project, LUMO, a premium personal AI companion.



CRITICAL RULES — READ FIRST



1. This is an EXISTING project. Preserve its current architecture, screens, components, styling, assets, and working functionality.

2. Do NOT rebuild the app from scratch, create a duplicate project, or replace existing screens with generic templates.

3. Do NOT delete, rename, or rewrite major files unless absolutely necessary.

4. Minimize credit usage. Avoid unnecessary exploration, repeated planning, excessive explanations, and cosmetic changes that do not materially improve the product.

5. Do not start a large implementation until you have inspected the imported project and identified its current state.

6. Do not claim any feature works unless you can verify it.

7. Never expose, request, or commit API keys, passwords, OAuth tokens, or secrets. Do not create or expose ".env" files.

8. Do not modify or overwrite my original GitHub repository without my explicit approval.



PRODUCT DESIGN



LUMO should feel like a premium, futuristic personal AI companion:



- Near-black interface with refined cyan/electric-blue accents.

- Realistic, polished animated AI orb/core, not a cartoon character.

- Responsive portrait mobile, landscape mobile, tablet, and desktop layouts.

- Smooth, restrained transitions and clear loading, error, offline, and empty states.

- Preserve the project's existing visual direction and any components that are already good.



Avoid generic chatbot layouts, unnecessary redesigns, decorative animations that interfere with usability, and excessive glow effects.



WORKFLOW — MINIMUM CREDIT USAGE



Step 1: Inspect



Quickly inspect the imported codebase and identify:



- Existing screens and routes.

- Main components and styling system.

- Current functionality and incomplete UI.

- Any missing assets, broken imports, or obvious responsive issues.



Do not conduct a lengthy investigation. Do not modify files during this initial inspection.



Step 2: Report briefly



Provide a concise report listing:



- What already exists and should be preserved.

- The three highest-priority UI issues.

- Whether the imported project appears structurally intact.

- Any essential information needed before implementation.



Do not repeat features that are already implemented correctly.



Step 3: Implement efficiently



After the audit, fix the highest-priority issues in the existing code with the smallest sensible set of changes. Prioritize:



1. AI orb and voice UI: A polished animated orb with meaningful visual states such as idle, listening, processing, and speaking. Connect states only to existing functionality; do not fake voice recognition or speech generation.

2. AI Browser screen: Improve the existing browser interface to present the current or most recent agent session, with honest status indicators, progress, and results. Do not invent a live browser session or claim that browser automation works without a real integration.

3. Responsive polish: Correct major layout problems across portrait mobile, landscape mobile, and desktop.

4. Authentication UI: Preserve the current auth flow and improve its appearance and states without pretending that biometric authentication, face recognition, or backend authentication is operational when it is not.



Do not redesign every screen unnecessarily. Reuse existing components and styles. Do not add new dependencies unless essential.



Step 4: Verify



Run the checks available in the environment. Fix obvious regressions caused by your changes. Report what was actually tested and what remains unverified.



BACKEND BOUNDARY



This task is primarily UI work. Do not invent backend services, API responses, OAuth connections, database records, AI functionality, browser automation, or authentication success. Clearly identify backend-dependent functionality that requires later implementation.



FINAL RESPONSE



Return a short report containing:



- Files/components changed.

- UI improvements completed.

- Checks actually performed and their results.

- Remaining issues and required backend work.

- Confirmation that unrelated existing features were preserved.



Efficiency requirement: Make targeted changes, reuse existing code, avoid repeated analysis, and conserve credits. If the project import is incomplete or a major architectural issue prevents safe work, stop and explain the blocker instead of rebuilding the application.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e3e8be11-5f23-47ce-86f0-205fd67ff48d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
