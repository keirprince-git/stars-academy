import { requireAuth } from "@/lib/auth";
import { createPlayer, nextPlayerCode } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function NewPlayerPage() {
  await requireAuth("admin");
  const suggestedCode = nextPlayerCode();

  async function handleCreate(formData: FormData) {
    "use server";
    const id = createPlayer({
      code:        formData.get("code") as string,
      name:        formData.get("name") as string,
      country:     (formData.get("country") as string) || undefined,
      source:      (formData.get("source") as string) || undefined,
      play_status: formData.get("play_status") as string,
      scholarship: formData.get("scholarship") === "1" ? 1 : 0,
      notes:       (formData.get("notes") as string) || undefined,
    });
    redirect(`/players/${id}`);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Add New Player</h2>
        <a href="/players" className="btn btn-sm">Cancel</a>
      </div>

      <div className="card">
        <form action={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>Player Code</label>
              <input name="code" type="text" defaultValue={suggestedCode} required />
            </div>
            <div className="form-group">
              <label>Name</label>
              <input name="name" type="text" required autoFocus />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Age Group</label>
              <select name="source" defaultValue="">
                <option value="">— Select —</option>
                <option value="Upper">Upper</option>
                <option value="Lower">Lower</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Play Status</label>
              <select name="play_status" defaultValue="Active">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Left">Left</option>
              </select>
            </div>
            <div className="form-group">
              <label>Scholarship</label>
              <select name="scholarship" defaultValue="0">
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group">
              <label>Notes</label>
              <textarea name="notes" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-1">Create Player</button>
        </form>
      </div>
    </>
  );
}
