# Views and client (Odoo 16 to 20)

Rules for this file. "docs" means github.com/odoo/documentation. "source" means odoo/odoo read on raw.githubusercontent.com. Where neither says it, the text says "not found". "How to check" items were not run against a live database. Treat them as uncorroborated.

## Summary (Odoo 19/20)

1. A view is an `ir.ui.view` record: `model`, `arch` (XML), `type`, `priority`, `inherit_id`, `mode` (primary or extension) [19.0 content/developer/reference/user_interface/view_records.rst].
2. Extension views patch a parent arch with xpath, field or tag locators and a position. The server combines them before it sends the arch [19.0 odoo/tools/template_inheritance.py, source].
3. Since 17 `attrs` and `states` are rejected. `invisible`, `readonly`, `required`, `column_invisible` hold Python expressions that the browser evaluates [17.0-19.0 odoo/addons/base/models/ir_ui_view.py _check_xml, source].
4. Since 18 list views use `<list>`, not `<tree>`, and the view type is `list` [18.0 content/developer/reference/user_interface/view_architectures.rst].
5. Every view is validated when its module loads (`_check_xml`): inheritance, root tag, field names, expressions, domains, groups, RNG schema [19.0 ir_ui_view.py, source].
6. The client is an Owl app. Components use `setup()`, hooks, registries and services (`orm`, `action`, `bus_service`, `notification`) [19.0 content/developer/reference/frontend/owl_components.rst, services.rst].
7. QWeb templates render on the server (views of type qweb, reports, website) and in the browser (Owl templates) [19.0 content/developer/reference/frontend/qweb.rst].
8. Assets are bundles declared in the manifest `assets` key or in `ir.asset` records, with operations append, prepend, before, after, include, remove, replace [19.0 content/developer/reference/frontend/assets.rst].
9. `?debug=1` enables debug mode. `debug=assets` stops minification and adds source maps. `debug=tests` adds the tests bundle [19.0 content/developer/reference/frontend/framework_overview.rst "Debug mode"].
10. In 20 the JS framework moves to Owl 3 alpha with plugins (`orm_plugin.js`, `bus_plugin.js`). The 20 docs do not describe this [20.0 addons/web/static/lib/owl/owl.js, source].

---

## 1. View types and architectures

### What it is
Each view has a type (form, list, kanban, search, pivot, graph, calendar, activity, and others). The root tag of the arch must match the type. The type decides which JS view class and which RNG schema apply.

### How it works
1. `ir.ui.view.type` is a Selection. A view with no explicit type takes it from the root tag [19.0 ir_ui_view.py `create`, source].
2. `qweb` views need the type set explicitly.
3. The default view for a model and type is the one with the lowest `priority` [19.0 view_records.rst].
4. `ir.actions.act_window.view_mode` lists the types an action offers.
5. At load the arch is validated (see section 5).

| Type | Root | Notes |
|---|---|---|
| form | `<form>` | `<chatter/>` since 18 |
| list | `<list>` | `<tree>` before 18 |
| kanban | `<kanban>` | templates `card`, `menu` since 18 |
| search | `<search>` | filters, group by, searchpanel |
| pivot, graph, calendar, activity | same name | have RNG schemas |
| qweb | `<t>` | explicit type |
| card | `<card>` | new in 20 |

### Where it breaks
- A form or kanban arch has no RNG file. Only the Python and field checks protect it [19.0 odoo/tools/view_validation.py `@validate`, source].
- In 18 to 20 a root tag with no explicit type raises "Invalid view type ... You might have used an invalid starting tag" when the tag is not valid for that version [18.0 ir_ui_view.py `create`, source]. [corrected]
- Using the same field twice in a list is not supported [19.0 view_architectures.rst, list field].
- Some views have no RNG, for example those that accept HTML [19.0 view_architectures.rst "Generic architecture"].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | View docs sit in one file. Types include gantt and activity. | [16.0 content/developer/reference/backend/views.rst] |
| 17 | Docs split into view_records.rst and view_architectures.rst. | [17.0 content/developer/reference/user_interface/view_architectures.rst] |
| 18 | `<chatter/>` replaces `<div class="oe_chatter">`. Footer gets `replace`. `banner_route` removed. Kanban `card` template. Date filter sub-attributes. | [18.0 view_architectures.rst], [18.0 addons/web/static/src/views/kanban/kanban_arch_parser.js] |
| 19 | `control` element extended (create, button, delete). Searchpanel `depth`. Calendar section rewritten. | [19.0 view_architectures.rst] |
| 20 | `card` view type. List `column` element. `width` min/max. Lazy filter options. `dialog_size`. | [20.0 view_records.rst], [20.0 view_architectures.rst], [20.0 odoo/addons/base/models/ir_ui_view.py type Selection, source] |

### How to check
Settings > Technical > User Interface > Views (debug mode). Filter by Model, read Type and Priority.
Or in `odoo shell`: `env['ir.ui.view'].search([('model','=','res.partner')]).mapped(lambda v:(v.type,v.priority,v.mode))`.

### Question seeds
1. Scenario: Two form views exist for `res.partner`, priorities 16 and 5, both primary. The user opens a partner. Which loads? Answer: priority 5 (lowest). Tempting wrong: the most recently created. It fails because the default is chosen by priority, not by date [19.0 view_records.rst].
2. Scenario: A module ships `<record model="ir.ui.view">` with `<t t-name=...>` in arch and no `type`. Install in 19. What happens? Answer: it must set `type` to `qweb`. Tempting wrong: Odoo guesses qweb from `<t>`. It fails because qweb needs an explicit type [19.0 view_architectures.rst "QWeb"].
3. Scenario: A dev writes a custom list arch with a `<field name="x"/>` twice for different widths. Answer: unsupported. Tempting wrong: the last one wins. It fails because the docs say it is not supported, so behaviour is not guaranteed [19.0 view_architectures.rst].
4. Scenario: A team builds a 20 module that adds a `card` view. They add `card` to `view_mode` in 19. Answer: the type does not exist in 19. Tempting wrong: it falls back to kanban. It fails because 19 has no card type in the selection (20 adds it) [20.0 ir_ui_view.py, source].

---

## 2. View inheritance, xpath and positions

### What it is
An extension view changes a parent arch without copying it. It names an element (locator) and a position. The server applies all extensions to build one combined arch.

### How it works
1. Set `inherit_id`. `mode` defaults to extension. `mode=primary` makes a new standalone view [19.0 view_records.rst].
2. The parent is resolved first. Extension children then apply depth-first, ordered by `priority` then `id`. Primary children go to the end of the queue [19.0 ir_ui_view.py `_combine`, `_get_inheriting_views`, source].
3. Locators [19.0 view_records.rst]:
   - `xpath` with `expr`. The first match is used. `hasclass(*classes)` is an extension function.
   - `field` matched by `name`. Other attributes are ignored.
   - Any other tag, matched by tag and identical attributes (position and version ignored).
4. Positions:

| Position | Effect |
|---|---|
| inside (default) | append as last child |
| after / before | insert next to the match |
| replace | swap the match. `$0` in the body stands for the matched node |
| attributes | edit attributes with `<attribute name=...>` |
| move | move a node (child `<xpath position="move">`) into the target |

5. `attributes`: a body sets the value. An empty body removes the attribute. `add`/`remove` with `separator` (default ",") edit a list value [19.0 template_inheritance.py `apply_inheritance_specs`, source].
6. `replace` accepts `mode="outer"` or `mode="inner"`. The docs do not describe `inner` (grep found none). It exists in 16 to 20 source [16.0-20.0 odoo/tools/template_inheritance.py].
7. For Python-expression attributes (`readonly`, `required`, `invisible`, `column_invisible`, `t-if`, `t-elif`, `decoration-*`) `add`/`remove` need `separator` `and` or `or`. The result is `(old) and (add)` [18.0-20.0 template_inheritance.py, source]. Absent in 16 and 17.

### Where it breaks
- Locator misses raise `Element “...” cannot be located in parent view` [19.0 template_inheritance.py `locate_node`, source].
- An xpath with no `expr` raises "Missing 'expr' attribute in xpath specification".
- Matching on `@class` logs a warning. Use `hasclass()` [19.0 ir_ui_view.py, source].
- Matching on a translated attribute (string, help, and so on) raises "View inheritance may not use attribute ... as a selector".
- A primary child applies after all extensions, so an extension cannot see it.
- Only `mode='extension'` children with the same model are followed by `_get_inheriting_views`.
- Not verified: a python attribute `add` with no `separator` probably fails (code reads `None.strip()`).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Docs in backend/views.rst. Inheritance rules same as 17. | [16.0 content/developer/reference/backend/views.rst] |
| 17 | no change found in the docs | [17.0 view_records.rst] |
| 18 | Source: python-attribute `add`/`remove` require `separator` and/or. | [18.0 odoo/tools/template_inheritance.py] |
| 19 | no change found (same as 18) | [19.0 template_inheritance.py] |
| 20 | no change found | [20.0 template_inheritance.py] |

### How to check
Debug mode > edit the view > "Inherited views" tab. Or `env['ir.ui.view'].browse(ID).get_combined_arch()` in `odoo shell` (method name not verified; `_get_combined_arch` is the source name, see section 5).

### Question seeds
1. Scenario: Two extensions of one form, priorities 10 and 20, both hit `//field[@name='name']` with `position="replace"`. Which applies first? Answer: priority 10, then 20 on the result. Tempting wrong: the higher number first. It fails because order is ascending priority then id [19.0 ir_ui_view.py `_get_inheriting_views`, source].
2. Scenario: You want to remove `invisible` from a field. You write `<attribute name="invisible"/>` empty. Answer: that removes the attribute. Tempting wrong: it sets it to false. It fails because an empty body removes the attribute [19.0 view_records.rst].
3. Scenario: In 19 you extend `invisible="a"` with `<attribute name="invisible" add="b"/>`. Answer: needs `separator="or"`, giving `(a) or (b)`. Tempting wrong: the default "," separator gives "a,b". It fails because Python attributes need `and`/`or` [19.0 template_inheritance.py, source].
4. Scenario: A primary view inherits a parent and an extension of the parent also exists. Which is in the primary? Answer: both, extensions of the parent are applied. Tempting wrong: only the parent. It fails because `_combine` applies the parent's extensions to primary children [19.0 ir_ui_view.py `_combine`, source].

---

## 3. Modifiers (attrs/states removal, expressions, column_invisible)

### What it is
Modifiers set whether a field or button is invisible, readonly or required. In 17 Odoo dropped the `attrs` domain syntax and the `states` attribute. Now each modifier is a Python expression string.

### How it works
1. Write `invisible="state != 'draft'"`. Valid attributes: `invisible`, `readonly`, `required`, `column_invisible` (`VIEW_MODIFIERS`) [19.0 ir_ui_view.py, source].
2. The browser evaluates the expression with py_js [19.0 framework_overview.rst "Python Interpreter"].
3. Context available [19.0 view_architectures.rst "Python expression"]:
   - field names present in the view (relational fields as ID lists),
   - `parent` (sub-views only), `context`, `uid`, `today`, `now`, `id`.
4. `column_invisible` hides a whole list column. It is evaluated without row values.
5. `groups` can start with `!` to exclude a group [19.0 view_architectures/generic_attribute_groups.rst].
6. At load `NameManager.check` verifies every name used is in the view [19.0 ir_ui_view.py, source].

### Where it breaks
- A field used in an expression must be in the view. `invisible="1"` on the field is enough. Otherwise: "Name or id “X” in ... must be present in view but is missing." [16-20 ir_ui_view.py, source].
- Any node with `attrs` or `states` raises ValidationError: 'Since 17.0, the "attrs" and "states" attributes are no longer used.' [17-19 ir_ui_view.py `_check_xml`, source].
- A field repeated in a view with different `required` is not guaranteed [19.0 view_architectures.rst form field].
- `column_invisible` has no effect on sub-fields of a list `column` [20.0 view_architectures.rst].
- Old extensions that use `attrs` fail on module upgrade, not at runtime.
- The docs do not state the removal. The only mention found is "Syntax change: assets declaration, OWL updates, attrs." [17.0 content/developer/howtos/upgrade_custom_db.rst].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Server pops `attrs`/`states` into a `modifiers` JSON. `invisible` in a tree becomes `column_invisible`. `column_invisible` is an attrs key. | [16.0 ir_ui_view.py `transfer_node_to_modifiers`, source], [16.0 backend/views.rst] |
| 17 | `attrs`/`states` rejected. Direct Python expressions. `column_invisible` is an attribute. `_validate_expression` added. | [17.0 ir_ui_view.py, source], [17.0 view_architectures/generic_attribute_column_invisible.rst] |
| 18 | no change found in modifiers. Group-aware validation (`node_info`). | [18.0 ir_ui_view.py, source] |
| 19 | `control` children support `invisible` with parent record and context. | [19.0 view_architectures.rst] |
| 20 | `column` element in list. | [20.0 view_architectures.rst] |

### How to check
Install a module with `attrs="{'invisible':[('a','=',1)]}"` on 17+. The load fails with the "Since 17.0" message. Or grep your addons: `grep -rn 'attrs=\|states=' --include=*.xml .`.

### Question seeds
1. Scenario: You migrate a 16 form with `attrs="{'invisible':[('x','=',1)]}"` to 17. The module installs. Answer: it does not install. Tempting wrong: it works with a warning. It fails because `_check_xml` raises ValidationError [17.0 ir_ui_view.py, source].
2. Scenario: `invisible="partner_id == False"` but `partner_id` is not in the view. Answer: load error "must be present in view". Tempting wrong: the browser reads it from the record. It fails because only view fields are in the context [19.0 view_architectures.rst].
3. Scenario: You put `invisible="state=='done'"` on a list field to hide the column. Answer: hides cells per row. Use `column_invisible` for the column. Tempting wrong: it hides the column. It fails because `invisible` is evaluated per record [19.0 view_architectures.rst].
4. Scenario: `column_invisible="state=='done'"` on a list. Answer: `state` has no row value, so use a parent or context value. Tempting wrong: it reads the first row. It fails because it is evaluated without the row [19.0 view_architectures.rst].

---

## 4. tree to list rename

### What it is
In 18 the list view root tag and view type changed from `tree` to `list`.

### How it works
1. `ir.ui.view.type` has `list` in 18 to 20 and `tree` in 16 and 17 [16.0, 17.0, 18.0 ir_ui_view.py, source].
2. `ir.actions.act_window.view_mode` default is `tree,form` in 17 and `list,form` in 18 [17.0, 18.0 odoo/addons/base/models/ir_actions.py, source].
3. The docs say: "The root element of list views is `list` (the previous name was `tree`)" [18.0 view_architectures.rst].
4. x2many `mode` accepts `list` in 18+ and `tree` in 17 [18.0 view_architectures.rst].
5. `group_operator` became `aggregator` [18.0 view_architectures.rst list field].

### Where it breaks
- 18 source has no tree-to-list compat in `convert.py` or `ir_ui_view.py`. A root `<tree>` with no explicit type fails on create [18.0 source].
- `_validate_view` raises "The root node of a ... view should be a <list>, not a <tree>".
- Action `view_mode` still saying `tree` and xpaths on `//tree` break.
- 17 docs still show `<tree>`.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `tree`. RNG file tree_view.rng. | [16.0 odoo/addons/base/rng/tree_view.rng] |
| 17 | `tree` | [17.0 ir_ui_view.py, source] |
| 18 | `list`. `aggregator`. Width docs. | [18.0 view_architectures.rst] |
| 19 | `list`, list_view.rng | [19.0 odoo/addons/base/rng/list_view.rng] |
| 20 | `column` element, width min/max | [20.0 view_architectures.rst] |

### How to check
`grep -rn '<tree\|tree,form\|//tree' --include=*.xml --include=*.py .` in the module before porting to 18.

### Question seeds
1. Scenario: A 17 module has `<tree>` and loads on 18. Answer: fails to load. Tempting wrong: Odoo auto-renames. It fails because 18 has no compat code [18.0 ir_ui_view.py, source].
2. Scenario: `view_mode="tree,form"` on an action in 18. Answer: the `tree` type is unknown. Tempting wrong: it is an alias for list. It fails because the 18 selection has `list` only [18.0 ir_ui_view.py, source].
3. Scenario: An extension uses `//tree/field[@name='x']` on 18 core views. Answer: no match. Tempting wrong: it still works since the XML tag is the same name in the DB. It fails because the arch tag is `list` [18.0 view_architectures.rst].
4. Scenario: A list uses `group_operator="sum"` in a 18 field. Answer: the 18 docs name it `aggregator`. Tempting wrong: both are accepted. It fails because the docs list only `aggregator` (not verified against the field source).

---

## 5. How a view is validated at module load

### What it is
`ir.ui.view._check_xml` is a constraint on `arch_db`, `inherit_id`, `model`. It runs when a view is created, written or loaded from data.

### How it works
1. Parse the arch. If `inherit_id` is set, `_valid_inheritance` checks the locators.
2. `_get_combined_arch` builds the full arch.
3. It checks primary views that extend this view. Context `_skip_primary_extensions_check` skips this. During an upgrade only loaded views count.
4. A `qweb` type stops here.
5. `_validate_view(combined_arch, model)`: root tag equals type, model exists, per-tag `_validate_tag_<tag>`, `_validate_attributes` when the node has the `__validate__` flag (set on nodes the current view touched).
6. The `attrs`/`states` check (17+).
7. `valid_view` runs the RNG schema [19.0 ir_ui_view.py `_check_xml`, source].
8. Errors wrap as "Error while validating view near: ..." with 5 lines of context.
9. RNG in 19 covers calendar, graph, pivot, search, list, activity [19.0 odoo/tools/view_validation.py `@validate`, source].

### Where it breaks
- Unknown field: "Field `X` does not exist." A button `type=action` with a bad xmlid fails.
- Missing `groups` only logs a warning (`_log_view_warning`).
- `data-tooltip*` attributes in arch are forbidden. `__comp__` in t- expressions is forbidden.
- Domains are checked by `_check_field_paths`. Non-searchable and unknown fields raise. Paths starting with `parent` are skipped.
- context `group_by` must be a string constant naming an existing field.
- Validation uses a `lang=None` model.
- The docs do not describe this algorithm (gap).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `_check_xml` at line 425. Modifiers built server-side. RNG tree_view. | [16.0 ir_ui_view.py, source] |
| 17 | `_validate_expression`, `_validate_domain_identifiers`, attrs check. | [17.0 ir_ui_view.py, source] |
| 18 | `node_info`, group-aware validation using `res.groups` universe. | [18.0 ir_ui_view.py, source] |
| 19 | no change found beyond line shifts | [19.0 ir_ui_view.py, source] |
| 20 | `_validate_data_icon_accessibility` replaces `_validate_fa_class_accessibility`. | [20.0 ir_ui_view.py, source] |

### How to check
`odoo -d db -u my_module --stop-after-init` and read the log. The ValidationError names the view and file.

### Question seeds
1. Scenario: An extension view removes a field that another view's expression uses. Install passes alone. Answer: the primary-extension check can fail when the combined arch is validated. Tempting wrong: only the extension is validated. It fails because the combined arch is checked [19.0 ir_ui_view.py, source].
2. Scenario: A button has `groups="no.such_group"`. Answer: a warning is logged. Tempting wrong: install fails. It fails because missing groups only warn [19.0 ir_ui_view.py, source].
3. Scenario: A kanban arch has a wrong attribute. Answer: it is not caught by RNG. Tempting wrong: RNG rejects it. It fails because kanban and form have no RNG [19.0 view_validation.py, source].
4. Scenario: A form view uses `data-tooltip="x"`. Answer: validation error. Tempting wrong: the 17+ docs show it, so it passes. It fails because arch validation forbids it [19.0 ir_ui_view.py, source].

---

## 6. QWeb

### What it is
QWeb is the XML template language. It renders on the server (Python) and in the browser (Owl compiles client templates).

### How it works
1. Directives [19.0 qweb.rst]: `t-out` (auto-escape; the docs do not mention `t-esc`), `t-if`/`t-elif`/`t-else`, `t-foreach`/`t-as` (gives `_index`, `_first`, `_last`), `t-att`, `t-attf`, `t-set`, `t-call`. [corrected]
2. Python-only: `t-field`, `t-options`, `t-debug` (calls `breakpoint`).
3. Client: `t-name`, `t-inherit`, `t-inherit-mode` (primary or extension) with xpath.
4. A qweb view needs an explicit type. Extra context: `model`, `domain`, `context`, `records`. `<nav class="o_qweb_cp_buttons">` moves to the control panel. Hooks: `_qweb_prepare_context`, `qweb_render_view` [19.0 view_architectures.rst "QWeb"].

### Where it breaks
- `t-raw` is deprecated since 15. Use `Markup`.
- The JS section of the docs still describes QWeb2.Engine, `t-extend`, `t-jquery`, `t-js`, `t-log` (stale, Owl templates are used).
- `--dev=qweb` breaks on `t-debug` [19.0 cli.rst].
- `t-cache`/`t-nocache`: in 16 to 18 docs, not in 19/20 docs. Source: grep found them in 16, 17, 18 `ir_qweb.py` and none in 19, 20 `ir_qweb.py`. Whether they moved is not verified.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Templates carry `owl="1"`. `t-cache` documented. | [16.0 content/developer/reference/frontend/owl_components.rst], [16.0 qweb.rst] | [corrected]
| 17 | `t-cache` documented | [17.0 qweb.rst "Rendering cache"] |
| 18 | `t-cache` documented | [18.0 qweb.rst] |
| 19 | `t-cache` section gone | [19.0 qweb.rst] |
| 20 | "Deprecated output directives" block dropped | [20.0 qweb.rst] |

### How to check
Debug mode > Technical > User Interface > Views, open a qweb view and render it. Or `env['ir.qweb']._render('module.template_id', {})` in `odoo shell`.

### Question seeds
1. Scenario: A template shows user HTML with `t-out`. Answer: it is escaped unless it is `Markup`. Tempting wrong: it renders as HTML. It fails because `t-out` auto-escapes [19.0 qweb.rst].
2. Scenario: You add a qweb view with no `type`. Answer: set `type=qweb`. Tempting wrong: it infers it. It fails per view_architectures "QWeb" [19.0].
3. Scenario: `t-foreach="items" t-as="i"`. Which names exist? Answer: `i`, `i_index`, `i_first`, `i_last` and others. Tempting wrong: `index`. It fails because variables are prefixed by the `t-as` name [19.0 qweb.rst].
4. Scenario: You use `t-cache` on 19 on the strength of a 17 blog post. Answer: not documented in 19, no source found. Tempting wrong: it works as in 17. It fails because the 19 docs dropped it and the source was not found [gap].

---

## 7. Owl components and hooks

### What it is
Owl is Odoo's component framework. A component is a class with a template. `setup()` is the init method.

### How it works
1. Never override the constructor. Use `setup()` [19.0 owl_components.rst "Best practices"].
2. Template names: `addon_name.ComponentName`.
3. Import from `@odoo/owl` (17+) [17.0+ docs]. In 16: `const { Component, tags } = owl` and `owl="1"` on templates.
4. Hooks in `@web/core/utils/hooks`: `useService`, `useBus`, `useAutofocus`. Others: `useAssets`, `usePager`, `usePosition`, `useSpellCheck` (17+) [19.0 hooks.rst].
5. `useService` wraps async calls so they stop after the component is destroyed [19.0 javascript_reference.rst "Using services"].
6. Owl version: source `owl.js` says 2.8.4 in 16, 17, 18, 19 and 3.0.0-alpha.49 in 20 [source].

### Where it breaks
- Docs say "all Odoo versions (starting in version 14) share the same Owl version." Wrong for 20.
- 20 uses `owl3_compatibility_layer.js` and plugins. The docs for 20 are identical to 19 for hooks, owl_components and registries (no plugin docs).
- `legacy_service_starter.js` in 20 has "@todo owl3 migration temporary".

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Owl 2.8.4 in source; docs `owl="1"` | [16.0 owl.js, source], [16.0 owl_components.rst] |
| 17 | `import ... from "@odoo/owl"`. SelectMenu, TagsList. `useSpellCheck`. | [17.0 owl_components.rst, hooks.rst] |
| 18 | no change found | [18.0 hooks.rst] |
| 19 | no change found | [19.0 hooks.rst] |
| 20 | Owl 3 alpha, plugin files | [20.0 addons/web/static/lib/owl/owl.js, source] |

### How to check
In the browser console in debug mode: `odoo.__WOWL_DEBUG__`-style handles were not verified. Safe check: open `/web/static/lib/owl/owl.js` and read the version string.

### Question seeds
1. Scenario: A dev writes `constructor(){ super(...arguments); ... }` in a component. Answer: use `setup()`. Tempting wrong: constructor is fine. It fails by the docs' best practices [19.0 owl_components.rst].
2. Scenario: A service call resolves after the component unmounts. Answer: with `useService` it does nothing. Tempting wrong: it throws. It fails because the hook wraps it [19.0 javascript_reference.rst].
3. Scenario: A 20 module calls `useService("orm")`. Answer: not verified; 20 has `orm_plugin.js` and a legacy starter. Tempting wrong: the service is removed. It fails because the legacy starter exists to keep services working (unverified).
4. Scenario: Which Owl version does 19 ship? Answer: 2.8.4. Tempting wrong: 3. It fails because the source says 2.8.4 [19.0 owl.js].

---

## 8. Registries

### What it is
A registry is a key-value store with categories. Features register into it: services, fields, views, actions, systray.

### How it works
1. API: `add(key, value, {force, sequence})`, `get`, `contains`, `getAll` (ordered by sequence), `remove`, `category` [19.0 registries.rst, identical across 16 to 20].
2. `add` on a duplicate key throws unless `force: true`.
3. A registry emits an `UPDATE` event.
4. Documented categories: effects, formatters, main_components, parsers, services, systray (default sequence 50, lowest on the right), user_menuitems.
5. `fields`, `views`, `actions` are not in that list. They appear in howtos. Fields: key is the widget name, component has `static supportedTypes` and `props = standardFieldProps` [19.0 howtos/javascript_field.rst]. Actions: key is the `ir.actions.client` tag [19.0 javascript_reference.rst "Client actions"].

### Where it breaks
- Duplicate key without `force` throws.
- The 19 user_menuitems example uses `env._t` and `env.services.action_manager`. The real name is `action` [19.0 addons/web/static/src/webclient/user_menu/user_menu_items.js, source].

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | registries.rst | [16.0 registries.rst] |
| 17 | no change found | [17.0 registries.rst] |
| 18 | no change found | [18.0 registries.rst] |
| 19 | no change found | [19.0 registries.rst] |
| 20 | no change found in docs | [20.0 registries.rst] |

### How to check
Debug console: `odoo.loader.modules.get("@web/core/registry").registry.category("fields").getKeys()` (not run).

### Question seeds
1. Scenario: Two modules add `registry.category("fields").add("my_widget", X)`. Answer: second throws. Tempting wrong: last wins. It fails because `force` is needed [19.0 registries.rst].
2. Scenario: Systray items at sequence 1 and 100. Which is rightmost? Answer: sequence 1. Tempting wrong: 100. It fails because lowest is on the right [19.0 registries.rst].
3. Scenario: A client action is registered. What is the key? Answer: the `tag` of `ir.actions.client`. Tempting wrong: the action xmlid. It fails per javascript_reference [19.0].
4. Scenario: `getAll()` order. Answer: by sequence. Tempting wrong: insertion order. It fails per registries.rst.

---

## 9. Services: orm, action, bus_service, rpc

### What it is
A service is a shared singleton in `registry.category("services")`. A definition has `dependencies`, `start(env, deps)` and optional `async`.

### How it works
1. `useService("orm")` returns an ORM. `call(model, method, args, kwargs)` posts to `/web/dataset/call_kw/{model}/{method}`. The user context is merged into kwargs [19.0 addons/web/static/src/core/orm_service.js, source].
2. 19 ORM methods: `create`, `read`, `formattedReadGroup`, `formattedReadGroupingSets`, `search`, `searchRead`, `searchCount`, `unlink`, `webReadGroup`, `webRead`, `webResequence`, `webSearchRead`, `write`, `webSave`, `webSaveMulti`, `.silent`, `.cache()`.
3. `x2ManyCommands`: create 0, update 1, delete 2, unlink 3, link 4, clear 5, set 6.
4. `useService("action")`: `doAction` with `additional_context` [19.0 framework_overview.rst "Action Context"].
5. `user.context` carries `allowed_company_ids` (first is main), `lang`, `tz`. The orm adds it.
6. rpc: `useService("rpc")` in 16 and 17. `import { rpc } from "@web/core/network/rpc"` in 18+ [18.0 services.rst].
7. `bus_service` (19) deps: `bus.parameters`, `localization`, `multi_tab`, `legacy_multi_tab`, `notification`, `worker_service`. Methods: `addChannel`, `deleteChannel`, `start`, `stop`, `forceUpdateChannels`, `send`, `subscribe`, `unsubscribe`, `isActive`, `workerState` [19.0 addons/bus/static/src/services/bus_service.js, source].
8. Server side: `bus.bus._sendone(target, type, message)`. In 19 values queue in `cr.precommit.data["bus.bus.values"]`. Use `_bus_send()` from `bus.listener.mixin`. Targets must not be guessable [19.0 addons/bus/models/bus.py, source].
9. Services documented: cookie, effect, http, notification, router, rpc, scroller, title, user. `orm`, `action`, `bus_service` are not in the list (gap).

### Where it breaks
- 16 `nameGet` and `readGroup` exist on the ORM. Later names differ (see table).
- [19.0 javascript_reference.rst] shows `this.rpc("/some/route/")`. [19.0 services.rst] says import `rpc`. They contradict.
- In 17+ `env.qweb` and `env._t` are gone from `env.js`, but docs list them [17-19 env.js, source].
- 20 sending bus messages to a `res.partner` warns (deprecated, use `res.users`) [20.0 busbus source].
- Autovacuum `_gc_messages` uses the `bus.gc_retention_seconds` parameter.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | ORM `nameGet`, `readGroup`, command names deleteAll/forget/linkTo/replaceWith. Bus SharedWorker websocket `/websocket`. `bus.addEventListener("notification")`, no `subscribe()`. `_sendone(channel,...)`. | [16.0 orm_service.js, bus_service.js, bus.py, source] |
| 17 | `webRead`, `webSave`. Commands unlink/link/clear/set. `subscribe/unsubscribe`. `_poll`. Notification `autocloseDelay`. | [17.0 same files, source] |
| 18 | ORM has no rpc constructor argument. docs: `rpc` import. | [18.0 orm_service.js, source], [18.0 services.rst] |
| 19 | `formattedReadGroup`, `webResequence`, `webSaveMulti`, `cache`. bus precommit queue. | [19.0 orm_service.js, bus.py, source] |
| 20 | `orm_service.js` and `bus_service.js` return 404. `core/orm_plugin.js`, `bus_plugin.js`, `worker_plugin.js` exist. Partner target warns. | [20.0 addons/web/static/src/core, addons/bus/static/src, source] |

### How to check
Server: `env['bus.bus']._sendone(env.user.partner_id, 'x', {})` (19: prefer `_bus_send` on a user; run in shell and watch `bus_bus`). Client: debug console, `odoo.__WOWL_DEBUG__` was not verified.

### Question seeds
1. Scenario: A 18 module calls `useService("rpc")`. Answer: use the `rpc` import in 18+. Tempting wrong: it works as in 17. It fails per [18.0 services.rst].
2. Scenario: You write x2many commands `[[6,0,ids]]` in JS ORM. Answer: `set` = 6, correct. Tempting wrong: 6 is `link`. It fails because link is 4 [19.0 orm_service.js, source].
3. Scenario: Bus message sent in a transaction that rolls back. Answer: in 19 it is queued in precommit data, so it is not delivered. Tempting wrong: it is sent immediately. It fails per [19.0 bus.py].
4. Scenario: Which service holds `doAction`? Answer: `action`. Tempting wrong: `action_manager`. It fails per [19.0 user_menu_items.js, source].

---

## 10. Field widgets and decorations

### What it is
A widget is the Owl component that displays and edits a field. `widget="name"` picks it from the `fields` registry. `decoration-*` styles list rows by expression.

### How it works
1. Field component: `static supportedTypes`, `props = standardFieldProps`, registered under the widget name [19.0 howtos/javascript_field.rst].
2. List root attributes (19): `editable` (top/bottom), `multi_edit`, `open_form_view`, `default_group_by`, `default_order`, `limit` (80 list, 40 x2many), `groups_limit`, `expand`, `sample`, `import`, `export_xlsx`, and `decoration-<style>` [19.0 view_architectures.rst list].
3. `decoration-<style>` styles: bf, it, info, warning, danger, muted, primary, success. Value is a Python expression with the record as context. Maps to CSS class `text-X` (bf and it are Odoo's own) [19.0 javascript_reference.rst "Decorations"].
4. Load validation checks decoration field names with `must_have_fields` in `_validate_attributes` [19.0 ir_ui_view.py, source].

### Where it breaks
- The field named in a decoration must be in the list.
- Using `decoration-*` with `attrs`-style domains is invalid since 17.
- 20 notes about `handle` widget and `kanban_color_picker` were seen but not studied (gap).

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | decorations as expressions | [16.0 backend/views.rst] |
| 17 | no change found | [17.0 view_architectures.rst] |
| 18 | `aggregator`. Width docs. | [18.0 view_architectures.rst] |
| 19 | no change found | [19.0 view_architectures.rst] |
| 20 | `width` min/max. Notes on `handle`, `kanban_color_picker`. | [20.0 view_architectures.rst] |

### How to check
Add `decoration-danger="amount < 0"` to a list and open it. Rows with a negative amount show with text-danger.

### Question seeds
1. Scenario: `decoration-danger="state=='x'"` but `state` is not in the list. Answer: load error. Tempting wrong: it works from the record. It fails because decoration fields must be in the view [19.0 ir_ui_view.py, source].
2. Scenario: Which CSS class does `decoration-info` use? Answer: `text-info`. Tempting wrong: `decoration-info`. It fails per [19.0 javascript_reference.rst].
3. Scenario: A custom widget is registered as `my_w` but the field is `Char` and `supportedTypes` is `["integer"]`. Answer: it is not offered/applies wrongly. Tempting wrong: widget attribute forces it. It fails by supportedTypes meaning (not verified in source).
4. Scenario: Limit of an x2many list default? Answer: 40. Tempting wrong: 80. It fails because 80 is for main lists [19.0 view_architectures.rst].

---

## 11. Assets bundles

### What it is
An asset bundle is a named list of JS, CSS/SCSS and XML template files served as one file. Modules add to bundles in the manifest.

### How it works
1. Manifest `assets` key maps bundle name to a list of paths and operations: append, prepend, before, after, include, remove, replace [19.0 assets.rst].
2. Operations on a target need the target declared earlier. The module must depend on the declaring one.
3. Order: `ir.asset` with sequence <16, then manifests in dependency order (first occurrence of a file wins), then `ir.asset` with sequence >=16 (default 16).
4. Name a file before a glob to force its order.
5. `ir.asset` fields: `name`, `bundle`, `directive` (default append), `path`, `target`, `active`, `sequence`. The `<asset>` XML syntax is preferred.
6. Lazy loading: `loadAssets({jsLibs, cssLibs})`, `useAssets` in `@web/core/assets`.
7. Processed bundles are stored as attachments, with a checksum in the URL. Minified unless `debug=assets`.
8. JS modules: 16 and 17 docs use opt-in `/** @odoo-module **/`. 18+: files under `/static/src` and `/static/tests` are transpiled by default. Opt out with `/** @odoo-module ignore **/` [18.0 content/developer/reference/frontend/javascript_modules.rst]. [corrected]

### Where it breaks
- Docs 17 to 20 still use `web.assets_common` in examples. Source 17+ web manifest has no such bundle. It has `web.assets_backend` (includes `web._assets_core`), `web.assets_web`, `web.assets_frontend`, `web.assets_frontend_lazy`, `web.report_assets_common` [17-20 addons/web/__manifest__.py, source].
- 18+ adds `web.assets_backend_lazy` and `web.assets_backend_lazy_dark`.
- A file in a module that is not in the bundle's dependency chain cannot be targeted.
- Stale bundle after code change: clear via debug `assets` or regenerate assets.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | Docs: `web.assets_common`, `web.qunit_suite_tests`. Source defines `web.assets_common` and `web.assets_backend`. | [16.0 assets.rst], [16.0 addons/web/__manifest__.py, source] |
| 17 | Docs: `web.qunit_suite_tests`. Source: no `assets_common`. | [17.0 assets.rst], [17.0 __manifest__.py, source] |
| 18 | Docs: `web.assets_unit_tests`. Default transpile of `/static/src` (in javascript_modules.rst). Lazy backend bundles. | [18.0 assets.rst] | [corrected]
| 19 | docs same as 18 | [19.0 assets.rst] |
| 20 | docs same as 18 | [20.0 assets.rst] |

### How to check
Open `/web?debug=assets`, then the browser Network tab shows individual files. Or Settings > Technical > User Interface > Assets (ir.asset) for DB-defined entries.

### Question seeds
1. Scenario: Your manifest uses `('after', 'web/static/src/a.js', 'my/b.js')` but your module does not depend on `web`. Answer: target not found. Tempting wrong: works since web loads anyway. It fails because the module must depend on the declaring one [19.0 assets.rst].
2. Scenario: An `ir.asset` with default sequence and a manifest file both add `x.js`. Which first? Answer: the manifest one. Tempting wrong: the ir.asset. It fails because default sequence 16 loads after manifests [19.0 assets.rst].
3. Scenario: You add a file to `web.assets_common` in 18. Answer: no such bundle in source. Tempting wrong: it is the shared bundle. It fails per [18.0 web manifest, source].
4. Scenario: A new JS file in `static/src` of a 19 module has no `@odoo-module` header. Answer: it is transpiled by default. Tempting wrong: it is loaded as classic JS. It fails per [18.0 javascript_modules.rst]. [corrected]

---

## 12. Debug mode

### What it is
Debug mode exposes developer tools and unminified assets. `env.debug` is a string. Non-empty means active.

### How it works
1. Enable with `/web?debug=1`.
2. Sub-modes: `assets` (no minification, source maps), `tests` (injects `web.assets_tests`, for tours). Combine: `assets,tests` [19.0 framework_overview.rst "Debug mode"].
3. Show items only in debug with `groups="base.group_no_one"`.
4. The router service doc shows `/web?debug=assets` [19.0 services.rst].

### Where it breaks
- `--dev=qweb` breaks on `t-debug` [19.0 cli.rst].
- Debug-only fields (group_no_one) are invisible without debug.
- Docs 17+ show `data-tooltip` in the tooltip section, but validation forbids it in view arch.
- Not found: docs for the details of debug activation or the 20 `debug_mode_plugin.js`.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | no tooltip section | [16.0 frontend docs] |
| 17 | tooltip docs, router docs | [17.0 services.rst] |
| 18 | no change found | [18.0 framework_overview.rst] |
| 19 | no change found | [19.0 framework_overview.rst] |
| 20 | `core/debug_mode_plugin.js` in source, not documented | [20.0 addons/web/static/src/core, source] |

### How to check
Open `/odoo?debug=assets` in 17+ (or `/web?debug=assets`) and look for the bug icon. Network tab lists each file.

### Question seeds
1. Scenario: You need unminified JS but not tours. Answer: `debug=assets`. Tempting wrong: `debug=1`. It fails because assets controls minification [19.0 assets.rst].
2. Scenario: A field with `groups="base.group_no_one"` for a normal user in `debug=1`. Answer: visible after debug is on and the user gets the technical group via debug. Tempting wrong: never visible. It fails per [19.0 framework_overview.rst] (group_no_one is the debug group).
3. Scenario: `env.debug` is `""`. Answer: debug off. Tempting wrong: `env.debug === false`. It fails because it is a string [19.0 framework_overview.rst].
4. Scenario: Tours do not run with `debug=assets`. Answer: add `tests`. Tempting wrong: assets includes tests. It fails because `tests` injects `web.assets_tests`.

---

## 13. Patching and JS modules

### What it is
`patch` changes an existing object or class at runtime. JS files are modules named `@addon/path`.

### How it works
1. 16: `patch(obj, patchName, patchValue, options)`, uses `this._super`.
2. 17 to 20: `patch(objToPatch, extension)`, uses native `super`, returns an unpatch function [17.0-20.0 docs].
3. Patch components through `MyComponent.prototype` and `setup()`. The constructor cannot be patched. An extension cannot be copied or cloned.
4. Module names `@addon/path`. Relative imports only inside one addon.
5. Alias: `/** @odoo-module alias=web.x default=0 **/`.
6. Limits: import/export must start a line. No comments inside an export object. Classic `odoo.define` is not deprecated.

### Where it breaks
- Using `_super` in 17+ fails.
- Patching a constructor silently does nothing useful.

### By version
| Version | Change | Citation |
|---|---|---|
| 16 | `_super` signature | [16.0 content/developer/reference/frontend/patching_code.rst] |
| 17 | new signature, native super | [17.0 patching_code.rst] |
| 18 | transpile by default under static/src | [18.0 javascript_modules.rst] | [corrected]
| 19 | no change found | [19.0 patching_code.rst] |
| 20 | no change found | [20.0 patching_code.rst] |

The file name patching_code.rst was not checked in this session; read the section in the frontend folder to confirm.

### How to check
Call `const un = patch(Cls.prototype, {...}); un();` in a test and confirm behaviour reverts.

### Question seeds
1. Scenario: A 17 patch uses `this._super(...)`. Answer: replace with `super.method(...)`. Tempting wrong: unchanged. It fails because the signature changed in 17.
2. Scenario: A dev patches the constructor of a component. Answer: use `setup()`. Tempting wrong: patch constructor. It fails per docs.
3. Scenario: A file under `static/src` in 18 lacks the header. Answer: transpiled anyway. Tempting wrong: not a module. It fails per [18.0 javascript_modules.rst]. [corrected]
4. Scenario: Need to opt out of transpile. Answer: `/** @odoo-module ignore **/`. Tempting wrong: remove the header. It fails because 18+ default is on.

---

## Gaps (looked for, not found)
- Docs for the attrs/states removal and its migration steps.
- Docs for the `orm`, `bus_service`, `action` services in the services reference list.
- Docs for the `fields`, `views`, `actions` registry categories in the registries reference.
- Docs for `replace mode="inner"`.
- Docs for the Python-attribute add/remove separator rule.
- A frontend changelog by version.
- Docs for Owl 3 plugins in 20.
- Source location of `t-cache` in 19 and 20.
- Docs for the validation algorithm and for debug-mode activation internals.
- Docs for any `<tree>` to `<list>` compat behaviour.
- A live run of any "How to check" item.

## Doubts
- Docs 17 to 20 reference `web.assets_common`, but the 17+ web manifest does not define it.
- `env._t` and `env.qweb` are documented, but removed from the 17+ `env.js`.
- [19.0 javascript_reference.rst] uses `this.rpc`, [19.0 services.rst] says the import.
- User-menu example uses `env.services.action_manager`. The real name is `action`.
- The Owl "same version since 14" claim is wrong for 20 (Owl 3 alpha).
- The JS QWeb docs (QWeb2.Engine, `t-extend`, `t-jquery`) are stale.
- `t-cache` left the docs in 19, and no 19/20 source was found.
- 17 docs still say `<tree>`.
- The documented bus event names (ACTION_MANAGER:UI-UPDATED and others) were not checked against source.
- The 20 service compatibility (`useService("orm")` via legacy starter) is inferred, not read.
- Section 13 patching citations: the docs file name was not confirmed.
- Section 10 `supportedTypes` behaviour and section 4 `aggregator` field-level behaviour are unverified.
