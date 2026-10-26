/** What a church sees for a role. The person who created the church is stored as "Owner" and shown as "Main Admin". */
export const roleLabel = (role: string | null | undefined): string => (role === "Owner" ? "Main Admin" : role ?? "");
