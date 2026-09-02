# SwiftShip AI Backend Plugin System & Owner Panel Roadmap

> **Note (2026-06 docs-sync):** this early thematic roadmap was superseded by
> [`ROADMAP_24W.md`](./ROADMAP_24W.md) (all 9 pillars complete — 65/65 tracker
> items closed). It is kept for the still-open plugin-system backlog below.
> Current state + resume order: [`STATUS.md`](./STATUS.md).

## Objective
Build the most advanced, scalable plugin system for the NestJS backend, and implement a robust, extensible owner management panel (admin panel) with React/Next.js integration. This roadmap focuses on backend architecture, plugin management, and API endpoints for the owner panel.

---

## 1. **Plugin System Architecture**

### 1.1. **Plugin System Foundation**
- [x] Create a `plugins/` directory for dynamic plugin modules
- [x] Define a `Plugin` interface (metadata, registration, hooks, permissions)
- [x] Implement a `PluginManagerService` for plugin discovery, loading, and lifecycle management
- [x] Support plugin types: business logic, integrations, UI extensions
- [x] Allow plugins to register GraphQL resolvers, REST endpoints, and event listeners *(GraphQL resolver for plugin listing added)*
- [x] Add plugin metadata schema (name, version, author, description, permissions, UI components)
- [ ] Implement plugin enable/disable and hot-reload (if feasible)
- [ ] Add plugin dependency and compatibility checks

### 1.2. **Security & Permissions**
- [ ] Plugins declare required permissions/roles *(interface supports this, enforcement pending)*
- [ ] Integrate with role-based access control (RBAC) system
- [ ] Add plugin sandboxing (optional, for untrusted plugins)

### 1.3. **Plugin API Exposure**
- [x] Expose plugin registry endpoint (list, status, metadata) *(GraphQL: `plugins` query)*
- [ ] Expose plugin management endpoints (install, enable, disable, remove)
- [ ] Expose UI plugin registry for frontend (React) to fetch available UI components

---

## 2. **Owner Management Panel (Admin Panel)**

### 2.1. **Core Owner/Admin Features**
- [ ] User management (CRUD, roles, permissions) *(users/roles GraphQL exists; full admin CRUD UI pending)*
- [x] Role management (create, assign, update, delete roles)
- [ ] Plugin management (list, enable/disable, install/remove plugins) *(listing done)*
- [x] Dashboard: analytics, system health, plugin status *(admin-portal `/dashboard` + NDR analytics; plugin health via `pluginStatus`)*
- [x] Audit logs for admin actions *(SS-028: `@Auditable()` audit log + `auditEvents` / `resourceHistory` queries; dedicated admin-portal page still pending)*

### 2.2. **API for React/Next.js Panel**
- [ ] GraphQL/REST endpoints for all admin features *(roles, orders, channels, NDR analytics, audit done; remaining admin features pending)*
- [ ] Endpoint to fetch available UI plugins/components for dynamic rendering
- [x] Secure authentication (JWT, session, or OAuth) *(Passport JWT + refresh tokens + API keys)*
- [ ] RBAC enforcement on all endpoints *(TenantGuard live; full RBAC on every admin endpoint pending)*

---

## 3. **Advanced Features & Best Practices**

- [ ] Plugin versioning and upgrade/downgrade support
- [ ] Plugin marketplace integration (optional, for future)
- [ ] Automated plugin testing and validation
- [ ] Documentation generator for plugins
- [ ] WebSocket/event support for real-time plugin features
- [ ] Monitoring and error reporting for plugins
- [ ] Internationalization (i18n) support for plugins and admin panel
- [ ] CI/CD integration for plugin deployment

---

## 4. **Milestones & Timeline**

### **Phase 1: Foundation (Week 1-2)**
- [x] Scaffold plugin system, interfaces, and manager
- [x] Basic plugin loading and registration
- [x] Owner panel API skeleton (user/role management) *(roles done, user management next)*

### **Phase 2: Core Features (Week 3-4)**
- [x] Dynamic plugin loading, enable/disable, metadata *(loading done, enable/disable in progress)*
- [x] Plugin API exposure (registry, management endpoints) *(registry done, management endpoints pending)*
- [ ] Owner panel endpoints for plugin management
- [ ] RBAC integration

### **Phase 3: Advanced & UI Integration (Week 5-6)**
- [ ] UI plugin registry and API for React
- [ ] Hot-reload (if feasible), dependency checks
- [ ] Audit logs, analytics, dashboard endpoints
- [ ] Automated plugin validation/testing

### **Phase 4: Polish & Docs (Week 7+)**
- [ ] Documentation generator
- [ ] Monitoring, error reporting
- [ ] i18n, CI/CD, marketplace prep

---

## 5. **Best Practices**
- Use templates for plugin structure and admin endpoints
- Regularly update roadmap and involve stakeholders ([Atlassian Roadmap Best Practices](https://www.atlassian.com/agile/project-management/project-roadmap))
- Assign clear ownership for roadmap items
- Visualize progress with Gantt charts or Kanban boards
- Maintain security and code quality at every step

---

**Progress Note (2026-06 sync):**
- Plugin system foundation, module, and GraphQL plugin listing are complete and integrated.
- Role management API (CRUD), admin dashboard, NDR analytics, channel management UI, and the
  audit log (SS-028) are live.
- Still open: plugin enable/disable endpoints + hot-reload, plugin dependency checks, UI
  plugin registry, full user-management CRUD, RBAC enforcement everywhere, audit-log admin page.
- The product roadmap that actually shipped is [`ROADMAP_24W.md`](./ROADMAP_24W.md);
  remaining plugin work should be re-beaded from STATUS.md before starting.

**This roadmap will be updated as the project evolves.** 