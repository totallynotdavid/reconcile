import { bug, ch, doc, exam, unverified } from "./build";
import type { Track } from "./types";

export const orm: Track = {
  id: "orm",
  title: "ORM, views, client",
  summary: "Server-side guarantees, view inheritance traps, and when the client should stay out of it.",
  levels: [
    {
      id: "orm-1",
      title: "Compute, constrain, onchange",
      brief: "Pick the hook by when it runs and whether it is binding.",
      caveat: "onchange runs on an in-memory record. That is the whole reason it cannot be a rule.",
      cards: [
        ch("o1-c1", "constrains", "A field named in @api.constrains is not in the form. A record is created by CSV import without it. Does the constraint run?", "No. It runs only when the field is among the vals of create or write", ["Yes, constraints run on every create", "Yes, but only through the UI", "No, constraints never run on import"], "The ORM triggers a constraint from the written field names. A rule that must always hold needs the field in the dependency list, or a SQL constraint.", exam()),
        ch("o1-c2", "depends", "@api.depends('partner_id.name') computes a field. A script changes the partner's name through write(). Does the compute run?", "Yes. It fires on any change of those fields, whatever the origin", ["No, only UI edits trigger it", "Only if the compute is non-stored", "Only if @api.onchange is also declared"], "depends is server-side and origin-agnostic. The ORM builds the dependency graph from it, and it accepts dotted paths.", exam()),
        bug("o1-b1", "onchange", "Which line breaks the contract of an @api.onchange method?", "python", [
          "@api.onchange('partner_id')",
          "def _onchange_partner_id(self):",
          "    if self.partner_id.property_payment_term_id:",
          "        self.invoice_payment_term_id = self.partner_id.property_payment_term_id",
          "    self.env['mail.message'].create({'body': 'partner changed'})",
        ], 4, "The record is in memory and may not exist in the database. Assign fields. Do not create, write, read or unlink inside onchange.", exam()),
        ch("o1-c3", "constrains", "The rule 'no invoice may be posted without a PO reference' must hold for imports, RPC and code. Where does it go?", "A server-side @api.constrains (or a SQL constraint), not an onchange", ["An @api.onchange on the form", "A JS check in the form widget", "A domain on the field in the view"], "onchange is form UX. Only create and write constraints stop bad data from every origin.", exam()),
        ch("o1-c4", "onchange", "Which statement about @api.onchange is true?", "It runs on the server, the client calls it over RPC, and its result is not saved until the user saves", ["It runs in the browser", "It runs inside the create transaction", "It runs on stored records only"], "It is a server round trip that works on a virtual record.", exam()),
      ],
    },
    {
      id: "orm-2",
      title: "Stored computes and volume",
      brief: "Make it cheap before it is high-volume.",
      caveat: "store=True moves cost to write time. A hot write path can pay it too often.",
      cards: [
        ch("o2-c1", "store", "A computed Monetary field is listed in a view of 50,000 invoices. Why does store=True matter?", "Only records whose dependencies changed are recomputed. Non-stored runs per row on every read", ["Stored fields are indexed automatically", "Non-stored fields cannot be shown in lists", "Stored fields skip access rules"], "Without store, the list pays for every row, every user, every open. Exam answer.", exam()),
        bug("o2-b1", "orm-perf", "Which line makes this compute slow at high volume?", "python", [
          "@api.depends('amount_residual', 'amount_total')",
          "def _compute_total_cobrado(self):",
          "    for move in self:",
          "        rec = self.env['account.partial.reconcile'].search([('debit_move_id.move_id', '=', move.id)])",
          "        move.total_cobrado = move.amount_total - move.amount_residual",
        ], 3, "A search per record is an N+1. The value is already derivable from fields in depends. Drop the search.", exam()),
        ch("o2-c2", "orm-perf", "You need to search and then read 10 fields of the result. Which API combines both into fewer queries?", "search_fetch (and fetch), added in Odoo 16.2", ["search followed by read in a loop", "search_read with every field, always", "name_search"], "search_fetch fills the cache while searching, so the later field access does not query again.", doc("16.2 (Online)", "ormLog")),
        ch("o2-c3", "orm-perf", "A screen only needs to show whether more than 50 records match. What helps in 16+?", "search_count with a limit. It stops counting at the limit", ["len(search([]))", "read_group on id", "Count in JS after loading everything"], "From 16.0, search_count honors limit, which makes a partial answer cheap.", doc("16.0", "ormLog")),
        ch("o2-c4", "orm-perf", "You want totals by partner in backend Python on 18.2 or later. Which call is the right one?", "_read_group", ["read_group", "search then sum in a loop", "A raw SQL string concatenation"], "read_group is deprecated for backend code in 18.2. It points to _read_group, and to formatted_read_group for the public formatted API.", doc("18.2 (Online)", "ormLog")),
        ch("o2-c5", "orm-perf", "When writing raw SQL inside a model, what should you wrap it in?", "The SQL object, introduced in 17.0 to compose queries safely", ["f-strings with ids joined by commas", "cr.execute with string concatenation", "A try/except around the query"], "The wrapper composes parameters safely and is what ORM methods use internally.", doc("17.0", "ormLog")),
      ],
    },
    {
      id: "orm-3",
      title: "Views and xpath",
      brief: "Anchor on names, count the matches, then look at the result.",
      caveat: "Loading a module validates the arch. It does not look at the screen.",
      cards: [
        bug("o3-b1", "xpath", "Which xpath is the most fragile?", "xml", [
          "<xpath expr=\"//button[@name='action_register_payment']\" position=\"after\">",
          "<xpath expr=\"//field[@name='amount_residual']\" position=\"after\">",
          "<xpath expr=\"//group[2]/field[1]\" position=\"after\">",
          "<field name=\"invoice_date\" position=\"attributes\">",
        ], 2, "A positional path depends on nobody adding a field above it. Anchor on @name.", exam()),
        ch("o3-c1", "xpath", "Before anchoring on a core field name, what should you check?", "How many nodes match that name, and where each one sits", ["That the field is stored", "That the field has a tooltip", "That the module depends on web"], "In core views the same field can appear twice, or its only appearance can be a technical one.", exam()),
        bug("o3-b2", "view-modifiers", "This module is loaded on 17. Which line fails validation?", "xml", [
          "<button name=\"action_auto_reconcile\" type=\"object\"",
          "        string=\"Reconcile\"",
          "        attrs=\"{'invisible': [('state', '!=', 'posted')]}\"",
          "        groups=\"account.group_account_user\"/>",
        ], 2, "attrs and states were removed in 17. Write the expression directly: invisible=\"state != 'posted'\". The 16.0 documentation covers attrs and the 17.0 documentation no longer does.", { version: "17.0", ref: "odoo/documentation: 16.0 backend/views.rst documents attrs; the 17.0 docs no longer do", verified: true }),
        ch("o3-c2", "view-verify", "The upgrade runs with no error, but the new field is not on screen. What is the most likely reason?", "The arch is valid but the field sits in the wrong group or hidden by an expression. Only opening the view shows it", ["The field does not exist", "The module was not installed", "The ORM cache is full"], "Loading checks names against the model. It cannot tell you where the field lands. Validate visually or with a tour.", exam()),
        ch("o3-c3", "groups", "You gate a button with groups=\"account.group_account_user\". What do you check first?", "implied_ids, to know which groups inherit it", ["Whether the button has a tooltip", "The module's load order", "Whether the button is type=\"action\""], "Group hierarchies decide who actually sees the node. Pick the group after reading them.", exam()),
        ch("o3-c4", "xpath", "Which position changes one attribute of a core node without replacing it?", "attributes", ["replace", "inside", "move"], "attributes touches only what you set. replace takes over the whole node and will collide with other modules that extend it.", exam()),
      ],
    },
    {
      id: "orm-4",
      title: "Access and security",
      brief: "Know what applies by which door the data takes.",
      caveat: "Access models changed twice after 17. The ideas hold, the method names do not.",
      cards: [
        ch("o4-c1", "access", "A user reads invoices through RPC. Do ir.rule restrictions apply as they do in the UI?", "Yes. RPC goes through the ORM, so model access and rules apply", ["No, RPC is admin by default", "Only if the request carries a session cookie", "Only for write calls"], "That is why a separate read-only user with an API key limits what RPC returns.", exam()),
        ch("o4-c2", "access", "What changed in Odoo 18 for checking permissions on a recordset?", "check_access, has_access and _filtered_access each check rights and rules together", ["Record rules were removed", "check_access_rights was added", "Access is now checked only at the database level"], "Before 18 you called two methods, rights and rule. Now one call does both.", doc("18.0", "ormLog")),
        ch("o4-c3", "access", "Odoo Online 19.3 added a domain operator named 'access'. What is it for?", "Checking the permissions of the comodel inside a record rule domain", ["Searching by the user who last accessed a record", "Granting temporary access to a record", "Filtering on the log of access attempts"], "It makes rules that depend on another model's access easier to write.", doc("19.3 (Online)", "ormLog")),
        ch("o4-c4", "access", "What did Odoo Online 19.4 introduce for access control?", "ir.access, which merges ACLs and record rules", ["A per-field password", "A second res.groups table", "Record rules moved to the client"], "A single model now describes what ACL and rules did separately.", doc("19.4 (Online)", "ormLog")),
      ],
    },
    {
      id: "orm-5",
      title: "The client: use the core first",
      brief: "Decide whether the problem needs OWL at all.",
      caveat: "OWL is the whole frontend since 17, so extending means registering a component, not patching.",
      cards: [
        ch("o5-c1", "owl-first", "The request: a traffic light on the invoice form for collection status. What do you do first?", "Check whether decoration-danger, decoration-warning and decoration-success on a field already do it", ["Write an OWL widget", "Add a JS service that polls", "Patch the form controller"], "The core already colors by expressions on record fields, with no JS. A widget is justified only after that fails.", exam()),
        ch("o5-c2", "js-vs-py", "Who decides what counts as 'overdue' or 'collected'?", "Python. JS decides how to show it", ["JS, because the user sees it", "Either, as long as they agree", "The view's domain"], "A number that goes in a report has to be computed in Python, or the report and the screen will disagree.", exam()),
        ch("o5-c3", "data-from-js", "A widget needs a value that belongs to the record being edited. Where does it read it?", "From this.props.record.data, after adding the field to the view", ["From a JSON-RPC call on mount", "From a bus_service channel", "From localStorage"], "Data that is part of the record already travels with it.", exam()),
        ch("o5-c4", "data-from-js", "A widget needs a value from the server that changes while the page is open. Which tool?", "bus_service for pushed updates. The orm service for a one-off call. Not polling every few seconds", ["setInterval with an orm call", "A page reload timer", "A global variable set by the server"], "Polling loads the server for every open tab.", exam()),
        ch("o5-c5", "owl-first", "In 17, how do you add a field widget?", "Register the component in the fields registry, instead of patching an existing one", ["Edit the core JS file", "Subclass the form view in Python", "Add an xpath to the QWeb template of the whole app"], "Views, field widgets and client actions are OWL components looked up in registries.", exam()),
      ],
    },
  ],
};
