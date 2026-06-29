import { ipcMain, app } from "electron";
import { getDatabase } from "./database";
import { v4 as uuid } from "uuid";

function cleanTable(table: string): string {
  return table.startsWith("[") ? table.slice(1, -1) : table;
}

export function registerDataHandlers() {
  const db = getDatabase();

  ipcMain.handle("db:query", (_e, rawTable: string, filters?: Record<string, any>) => {
    const table = cleanTable(rawTable);
    let sql = `SELECT * FROM "${table}"`;
    const params: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const clauses = Object.entries(filters).map(([key, val]) => {
        params.push(val);
        return `"${key}" = ?`;
      });
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    sql += ` ORDER BY created_at DESC`;
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle("db:getById", (_e, rawTable: string, id: string) => {
    const table = cleanTable(rawTable);
    return db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) || null;
  });

  ipcMain.handle("db:insert", (_e, rawTable: string, data: Record<string, any>) => {
    const table = cleanTable(rawTable);
    const id = data.id || uuid();
    const record = { ...data, id };

    const cols = Object.keys(record);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => record[c]);

    db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`).run(...values);

    // Log change for sync
    db.prepare(`INSERT INTO _change_log (table_name, record_id, action, data) VALUES (?, ?, 'insert', ?)`).run(
      table,
      id,
      JSON.stringify(record)
    );

    return record;
  });

  ipcMain.handle("db:update", (_e, rawTable: string, id: string, data: Record<string, any>) => {
    const table = cleanTable(rawTable);
    const cols = Object.keys(data);
    const setClauses = cols.map((c) => `"${c}" = ?`).join(", ");
    const values = cols.map((c) => data[c]);

    db.prepare(`UPDATE "${table}" SET ${setClauses} WHERE id = ?`).run(...values, id);

    // Log change
    const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id);
    db.prepare(`INSERT INTO _change_log (table_name, record_id, action, data) VALUES (?, ?, 'update', ?)`).run(
      table,
      id,
      JSON.stringify(updated)
    );

    return updated;
  });

  ipcMain.handle("db:delete", (_e, rawTable: string, id: string) => {
    const table = cleanTable(rawTable);
    db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);

    db.prepare(`INSERT INTO _change_log (table_name, record_id, action, data) VALUES (?, ?, 'delete', NULL)`).run(
      table,
      id
    );

    return { success: true };
  });

  ipcMain.handle("db:rawQuery", (_e, sql: string, params?: any[]) => {
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      return stmt.all(...(params || []));
    }
    return stmt.run(...(params || []));
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:dataPath", () => app.getPath("userData"));
}
