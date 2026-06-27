import { requireAuth } from "@/lib/auth";
import { getCategories, addCategory, updateCategory, deleteCategory, mergeCategory } from "@/lib/db";
import { redirect } from "next/navigation";

/** Derive a URL-safe category code from a human label. */
function slugify(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can manage categories.</p>;
  }

  const sp = await searchParams;
  const editId = sp.edit ? parseInt(sp.edit, 10) : null;

  const categories = getCategories();
  const incomeCategories = categories.filter(c => c.type === "income");
  const expenseCategories = categories.filter(c => c.type === "expense");

  /* ── Server actions ──────────────────────────────────── */

  const handleAdd = async (formData: FormData) => {
    "use server";
    const label = (formData.get("label") as string).trim();
    const type = formData.get("type") as "income" | "expense";

    if (!label || !type) {
      redirect("/accounts/categories?error=invalid");
    }

    // Derive code from label, with auto-suffix if the slug already exists.
    const base = slugify(label);
    if (!base) {
      redirect("/accounts/categories?error=invalid");
    }
    const existing = new Set(getCategories().map((c) => c.value));
    let value = base;
    let n = 2;
    while (existing.has(value)) {
      value = `${base}_${n++}`;
    }

    try {
      addCategory(value, label, type);
      redirect("/accounts/categories?success=added");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/accounts/categories?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleUpdate = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const label = (formData.get("label") as string).trim();
    const type = formData.get("type") as "income" | "expense";

    if (!id || !label || !type) {
      redirect("/accounts/categories?error=invalid");
    }

    updateCategory(id, label, type);
    redirect("/accounts/categories?success=updated");
  };

  const handleDelete = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    deleteCategory(id);
    redirect("/accounts/categories?success=deleted");
  };

  const handleMerge = async (formData: FormData) => {
    "use server";
    const sourceId = parseInt(formData.get("source_id") as string, 10);
    const targetId = parseInt(formData.get("target_id") as string, 10);
    if (!sourceId || !targetId || sourceId === targetId) {
      redirect("/accounts/categories?error=Pick%20two%20different%20categories%20to%20merge.");
    }
    try {
      mergeCategory(sourceId, targetId);
      redirect("/accounts/categories?success=merged");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/accounts/categories?error=${encodeURIComponent(msg)}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Manage Categories</h2>
        <a href="/accounts" className="btn btn-sm">Back to Accounts</a>
      </div>

      {sp.success === "added" && (
        <div className="alert alert-success">
          Category added.
        </div>
      )}
      {sp.success === "updated" && (
        <div className="alert alert-success">
          Category updated.
        </div>
      )}
      {sp.success === "deleted" && (
        <div className="alert alert-success">
          Category deleted. Any transactions using it have been uncategorised.
        </div>
      )}
      {sp.success === "merged" && (
        <div className="alert alert-success">
          Categories merged. All transactions now sit under the target category.
        </div>
      )}
      {sp.error && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{sp.error === "invalid" ? "Please fill in all fields." : sp.error}</div>
      )}

      {/* ── Income categories ──────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem", color: "var(--success)" }}>Income Categories</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {incomeCategories.map(c => (
              <tr key={c.id}>
                <td className="text-dim" style={{ fontSize: "0.85rem" }}>{c.value}</td>
                <td>
                  {editId === c.id ? (
                    <form action={handleUpdate} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input name="label" type="text" defaultValue={c.label} required style={{ maxWidth: "200px" }} />
                      <select name="type" defaultValue={c.type}>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      <button type="submit" className="btn btn-sm btn-primary">Save</button>
                      <a href="/accounts/categories" className="btn btn-sm">Cancel</a>
                    </form>
                  ) : (
                    c.label
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editId !== c.id && (
                    <>
                      <a href={`/accounts/categories?edit=${c.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Edit</a>
                      <form action={handleDelete} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="btn btn-sm">Delete</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Expense categories ─────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem", color: "var(--danger)" }}>Expense Categories</h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenseCategories.map(c => (
              <tr key={c.id}>
                <td className="text-dim" style={{ fontSize: "0.85rem" }}>{c.value}</td>
                <td>
                  {editId === c.id ? (
                    <form action={handleUpdate} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input name="label" type="text" defaultValue={c.label} required style={{ maxWidth: "200px" }} />
                      <select name="type" defaultValue={c.type}>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      <button type="submit" className="btn btn-sm btn-primary">Save</button>
                      <a href="/accounts/categories" className="btn btn-sm">Cancel</a>
                    </form>
                  ) : (
                    c.label
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editId !== c.id && (
                    <>
                      <a href={`/accounts/categories?edit=${c.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Edit</a>
                      <form action={handleDelete} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="btn btn-sm">Delete</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add new category ───────────────────────── */}
      <div className="card">
        <h2 style={{ marginBottom: "0.75rem" }}>Add Category</h2>
        <form action={handleAdd}>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group">
              <label htmlFor="label">Label</label>
              <input id="label" name="label" type="text" required placeholder="e.g. Transport" style={{ maxWidth: "240px" }} />
            </div>
            <div className="form-group">
              <label htmlFor="type">Type</label>
              <select id="type" name="type" required>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Add</button>
          </div>
          <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
            A short internal code is generated automatically from the label.
          </p>
        </form>
      </div>

      {/* ── Merge categories ───────────────────────── */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Merge Categories</h2>
        <form action={handleMerge}>
          <div className="form-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-group">
              <label htmlFor="source_id">Merge this category…</label>
              <select id="source_id" name="source_id" required defaultValue="">
                <option value="">— Select —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="target_id">…into this one</label>
              <select id="target_id" name="target_id" required defaultValue="">
                <option value="">— Select —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.label} ({c.type})</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Merge</button>
          </div>
          <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
            Every transaction in the first category is moved to the second, then the first category is removed. This can&apos;t be undone.
          </p>
        </form>
      </div>
    </>
  );
}
