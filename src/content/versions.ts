import { bug, ch, doc, map } from "./build";
import type { Track } from "./types";

export const versions: Track = {
  id: "versions",
  title: "Versions 16 to 20",
  summary: "What changed between each jump, and which line of your module breaks.",
  levels: [
    {
      id: "versions-1",
      title: "16 to 17",
      brief: "The jump that breaks views.",
      caveat: "Online (saas) versions such as 16.4 ship inside the next stable release. The changelog lists them separately.",
      cards: [
        ch("v1-c1", "v16-17", "Which view syntax stops working when a module moves to 17?", "attrs and states: use invisible, readonly and required with a direct expression", ["The <field> tag", "groups on nodes", "The position attribute of xpath"], "A module that still uses attrs fails validation at load.", { version: "17.0", ref: "odoo/documentation: 16.0 backend/views.rst documents attrs; the 17.0 docs no longer do" }),
        ch("v1-c2", "v16-17", "Method name_get is deprecated (shipped as 16.4, part of 17). What replaces it?", "Read display_name, and override _compute_display_name to change it", ["Override __str__", "Use name_search", "Call name_create"], "display_name is now a regular computed field.", doc("16.4 (Online)", "ormLog")),
        ch("v1-c3", "v16-17", "What does Odoo 17.0 add for building SQL inside models?", "The odoo.tools.SQL wrapper, which makes composition safer against injection", ["An async cursor", "Automatic string escaping in cr.execute", "A query builder in JS"], "ORM methods use it internally from 17.", doc("17.0", "ormLog")),
        bug("v1-b1", "v16-17", "Your 16 module is moving to 17. Which line is the one to rewrite?", "python", [
          "class AccountMove(models.Model):",
          "    _inherit = 'account.move'",
          "    def name_get(self):",
          "        return [(m.id, m.name or '/') for m in self]",
        ], 2, "name_get is deprecated. Override _compute_display_name and assign display_name instead.", doc("16.4 (Online)", "ormLog")),
        ch("v1-c4", "v16-17", "On 16.3, _read_group got a new signature. What does that mean for a 16.2 custom module?", "Calls written for the old signature break and need rewriting", ["Nothing, it is internal", "Only read_group changed", "Only the SQL changed, not the Python arguments"], "A signature change in a method you call or override is a break even when the name is the same.", doc("16.3 (Online)", "ormLog")),
        ch("v1-c5", "v16-17", "OWL 2 arrived in 16. What follows for custom JS written in the legacy widget style?", "It has to be rewritten as OWL components", ["Nothing, both run forever", "Only the XML templates change", "Only the CSS needs to change"], "Legacy JS does not survive the move. 17 is OWL for views, field widgets and client actions.", doc("17.0","owl")),
      ],
    },
    {
      id: "versions-2",
      title: "17 to 18",
      brief: "A rename, an access API and a safer name search.",
      caveat: "A rename like tree to list is mechanical. The access API change needs a decision per call site.",
      cards: [
        ch("v2-c1", "v17-18", "What is the root element of a list view in 18?", "<list>. The old name was <tree>", ["<table>", "<grid>", "<tree>, unchanged"], "The 18.0 reference states list as the root and tree as the previous name.", doc("18.0", "views")),
        ch("v2-c2", "v17-18", "You overrode name_search to customise the 'name' lookup. What does 18 do differently?", "Searching by name is implemented as _search_display_name, like any other field", ["name_search was moved to JS", "It is now a SQL function", "It no longer exists; nothing replaces it"], "Name search follows the same mechanism as any field search.", doc("18.0", "ormLog")),
        ch("v2-c3", "v17-18", "A server action that checked permissions with two calls (rights and then rules) on 17. What is available in 18?", "check_access, has_access or _filtered_access", ["Only check_access_rights, renamed", "Nothing; keep using two calls", "env.user.has_group only"], "They combine both in one call.", doc("18.0", "ormLog")),
        ch("v2-c4", "v17-18", "Odoo 17.4 removes the internal domain operator inselect. What do you use?", "in, with a Query or SQL object", ["not in", "like", "child_of"], "Any domain that carried inselect has to be rewritten.", doc("17.4 (Online)", "ormLog")),
        ch("v2-c5", "v17-18", "From 17.3, what does a domain or read_group gain?", "Grouping by date parts as numbers", ["Grouping by hour of week only", "A new aggregate named median", "Automatic timezone detection per user"], "That makes 'by month number' style reports possible without SQL.", doc("17.3 (Online)", "ormLog")),
        ch("v2-c7", "v17-18", "Accounting on 18: which change breaks code that reads a payment through its journal entry?", "account.payment has its own state and no longer inherits account.move", ["Payments moved to bank statements", "The payment model was renamed", "Payments became lines of the invoice"], "Filters on the move state or move_id fields need a rewrite.", map("accounting", "18.0")),
        ch("v2-c8", "v17-18", "Accounting on 18: a bookkeeper must post one late entry in a locked period. What exists that did not before?", "A lock exception (account.lock_exception) for a user and a period", ["Nothing; lower the lock date", "A per-journal password", "A cron that unlocks at night"], "Lock dates were reworked in 18 so one exception does not open the period for everyone.", map("accounting", "18.0")),
        ch("v2-c6", "v17-18", "From 18.1, how do you declare SQL constraints and indexes on a model?", "As model attributes, instead of the old _sql_constraints list", ["Only in XML data files", "With @api.constrains and an index argument", "Only through a migration script"], "The changelog says constraints and indexes are declared as model attributes. The 19.0 reference shows models.Constraint and models.Index.", doc("18.1 (Online)", "ormLog")),
      ],
    },
    {
      id: "versions-3",
      title: "18 to 19",
      brief: "Deprecations that turn into removals if you ignore them.",
      caveat: "Deprecated still works. Plan the rewrite while it works, not when it stops.",
      cards: [
        ch("v3-c1", "v18-19", "On 18.2, read_group is deprecated. What are the replacements?", "_read_group for backend code, formatted_read_group as the formatted public API", ["search_read with a limit", "aggregate()", "group_by()"], "Use the right one by caller: backend or external.", doc("18.2 (Online)", "ormLog")),
        ch("v3-c2", "v18-19", "What does @api.private (18.2) mark?", "A public-looking Python method that must not be callable over RPC", ["A method only the owner can call", "A method that skips access rules", "A deprecated method"], "It separates methods exposed for RPC from the rest.", doc("18.2 (Online)", "ormLog")),
        ch("v3-c3", "v18-19", "Since 18.3, demo data is not loaded by default. What breaks in your CI?", "Tests and tours that assumed demo records. They need explicit setup or demo loading", ["Nothing, test data is unaffected", "Only translations", "Only the website module"], "Make fixtures explicit instead of leaning on demo data.", doc("18.3 (Online)", "ormLog")),
        bug("v3-b1", "v18-19", "Which line is deprecated in 19.0?", "python", [
          "def _compute_stuff(self):",
          "    for rec in self:",
          "        rec.name = rec.env.context.get('x')",
          "        rec._cr.execute('SELECT 1')",
        ], 3, "record._cr, record._context and record._uid are deprecated in 19.0. Use rec.env.cr, rec.env.context and rec.env.uid.", doc("19.0", "ormLog")),
        ch("v3-c4", "v18-19", "Odoo 19 adds a new external API at /json/2. How does a client authenticate and say which database?", "A bearer API key, and the database name in the X-Odoo-Database header", ["A session cookie from /web/login", "Basic auth with the admin password", "A query string token plus db parameter"], "The call is POST /json/2/<model>/<method> with the arguments as named JSON fields.", doc("19.0", "extApi")),
        ch("v3-c5", "v18-19", "Which statement about XML-RPC and JSON-RPC at /xmlrpc, /xmlrpc/2 and /jsonrpc holds for 19?", "They are deprecated, with removal scheduled for Odoo 22", ["They were removed in 19", "They are the recommended API for new work", "Only XML-RPC is deprecated"], "New integrations should target /json/2.", doc("19.0", "extApi")),
        ch("v3-c6", "v18-19", "19.0 adds dynamic dates in domains. What does it let you do?", "Write relative date conditions that are resolved when the domain is evaluated", ["Store dates as strings in a domain", "Skip the timezone", "Compare dates across companies"], "Saved filters no longer need a hardcoded date.", doc("19.0", "ormLog")),
      ],
    },
    {
      id: "versions-4",
      title: "19 to 20",
      brief: "The first removals, and a computed field that can finally be sorted.",
      caveat: "The 20.0 changelog is short. Read the source of the modules you extend before you trust it as complete.",
      cards: [
        ch("v4-c1", "v19-20", "Which RPC service is removed in Odoo 20 (fall 2026)?", "db. The common and object services stay until Odoo 22", ["object", "common", "All three"], "A script that lists, duplicates or drops databases over RPC stops working in 20.", doc("20.0", "extApi")),
        ch("v4-c2", "v19-20", "A reporting model defines _table_query. What does 20.0 do?", "It removes Model._table_query, so the model needs rework", ["It keeps working but is deprecated", "It becomes a field attribute", "It moves to JS"], "The changelog names the removal. The replacement is not described there; read the source before porting.", doc("20.0", "ormLog")),
        ch("v4-c3", "v19-20", "From 19.1, Field.compute_sql can be set. What does it unlock?", "Grouping and sorting by a computed field that is not stored", ["Faster writes on stored fields", "Translation of computed fields", "Per-company computes"], "That changes the store=True trade-off from your exam. You can sometimes skip storage and still sort.", doc("19.1 (Online)", "ormLog")),
        ch("v4-c4", "v19-20", "From 19.3, Binary fields hold a BinaryValue. What is affected?", "Code that base64-encoded and decoded the field value by hand", ["Only image fields", "Only attachments in the website module", "Nothing in Python; only JS"], "The data flow stops encoding with base64 all over. In 20 the object also carries a filename.", doc("19.3 (Online)", "ormLog")),
        ch("v4-c5", "v19-20", "From 19.4, model code can no longer use the HTTP request. What is the alternative named for the website?", "env.website", ["self.request", "odoo.http.session", "A thread-local"], "The change removes request from models, with env.website added.", doc("19.4 (Online)", "ormLog")),
        ch("v4-c7", "v19-20", "The 20.0 source changes account.payment states compared with 19. What does the documentation say?", "Nothing. The 20 docs are identical to 19, so read the source", ["It lists the new states", "It removes payments", "It marks them as deprecated"], "In source, 20 uses draft, paid, reconciled, canceled and rejected. 19 has in_process, not reconciled.", map("accounting", "20.0")),
        ch("v4-c6", "v19-20", "In 20.0, what is the default copy behavior for a Char field named name?", "It adds \"(copy)\" to the value", ["It copies the value as is", "It clears the value", "It raises an error"], "Fields now have a copy function, and this is its default.", doc("20.0", "ormLog")),
      ],
    },
    {
      id: "versions-5",
      title: "What breaks in my 17 module",
      brief: "Walk a custom module through every jump, line by line.",
      caveat: "Each answer is correct for one jump. The cards ask you to name the jump.",
      cards: [
        bug("v5-b1", "v17-18", "Moving to 18. Which line is the pre-18 name?", "xml", [
          "<record id=\"view_move_list\" model=\"ir.ui.view\">",
          "  <field name=\"arch\" type=\"xml\">",
          "    <tree decoration-danger=\"payment_state == 'not_paid'\">",
          "      <field name=\"name\"/>",
        ], 2, "list replaces tree as the root element.", doc("18.0", "views")),
        bug("v5-b2", "v18-19", "A backend report on 19. Which call do you replace first?", "python", [
          "def _compute_totals(self):",
          "    data = self.env['account.move'].read_group(",
          "        [('state', '=', 'posted')], ['amount_total'], ['partner_id'])",
          "    return data",
        ], 1, "read_group was deprecated for backend code in 18.2. Use _read_group.", doc("18.2 (Online)", "ormLog")),
        bug("v5-b3", "v18-19", "Which line still declares a constraint the pre-18.1 way?", "python", [
          "class Rule(models.Model):",
          "    _name = 'x.rule'",
          "    _sql_constraints = [('amount_pos', 'CHECK(amount > 0)', 'Amount must be positive')]",
          "    amount = fields.Float()",
        ], 2, "Constraints and indexes became model attributes in 18.1.", doc("18.1 (Online)", "ormLog")),
        bug("v5-b4", "v19-20", "A deploy script talks to Odoo 20 over XML-RPC. Which call stops working?", "python", [
          "common = ServerProxy(f'{url}/xmlrpc/2/common')",
          "uid = common.authenticate(db, user, key, {})",
          "models = ServerProxy(f'{url}/xmlrpc/2/object')",
          "dbs = ServerProxy(f'{url}/xmlrpc/2/db').list()",
        ], 3, "The db service is removed in 20. common and object remain until 22, but plan the move to /json/2.", doc("20.0", "extApi")),
        ch("v5-c1", "v16-17", "Order the removals or deprecations by the version that introduced them: attrs, tree to list, read_group in backend, record._cr, the db RPC service.", "attrs (17), tree to list (18), read_group (18.2), record._cr (19.0), db service (20)", ["tree to list (17), attrs (18), record._cr (18.2), read_group (19), db service (19)", "record._cr (17), attrs (18), db service (18.2), read_group (19), tree to list (20)", "All five arrive in 19"], "Plan upgrades by this sequence. Each step is cheaper if you fix its class of issue once.", doc("20.0", "ormLog")),
      ],
    },
  ],
};
